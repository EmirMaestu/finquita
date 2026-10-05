import { effectiveGrant, newId, roundQty } from "@mostrador/shared";
import { and, asc, desc, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { loadOverrides, requireFull, requirePermission } from "../auth/permissions";
import {
  barcodes,
  categories,
  members,
  products,
  stockCountLines,
  stockCounts,
} from "../db/schema/index";
import { applyStock } from "../domain/stock";
import { auditFrom } from "../lib/audit";
import { ApiError, notFound } from "../lib/errors";
import { validate } from "../lib/validate";

export const countRoutes = new Hono<AppEnv>();

const createBody = z.object({
  name: z.string().min(1).max(80),
  scope: z.enum(["all", "category", "location"]),
  categoryId: z.uuid().optional(),
  location: z.string().max(60).optional(),
  assignedTo: z.uuid().nullable().optional(),
});

/** Crear un conteo (encargado o dueño): total, por categoría o por góndola. */
countRoutes.post(
  "/counts",
  requireActor(),
  requireFull("adjust_stock"),
  validate("json", createBody),
  async (c) => {
    const b = c.req.valid("json");
    const db = c.get("db");
    const { member } = actorOf(c);
    const where: SQL[] = [
      isNull(products.deletedAt),
      eq(products.active, true),
      eq(products.kind, "product"),
      isNull(products.stockBaseId),
    ];
    if (b.scope === "category") {
      if (!b.categoryId) throw new ApiError(400, "bad_request", "Elegí la categoría.");
      const cat = or(
        eq(products.categoryId, b.categoryId),
        sql`${products.categoryId} in (select ${categories.id} from ${categories} where ${categories.parentId} = ${b.categoryId})`,
      );
      if (cat) where.push(cat);
    }
    if (b.scope === "location") {
      if (!b.location) throw new ApiError(400, "bad_request", "Indicá la góndola.");
      where.push(eq(products.location, b.location));
    }
    const prods = await db
      .select({ id: products.id })
      .from(products)
      .where(and(...where));
    if (!prods.length)
      throw new ApiError(400, "empty", "No hay productos para contar con ese filtro.");
    const id = newId();
    await db.transaction(async (tx) => {
      await tx.insert(stockCounts).values({
        id,
        name: b.name,
        scope: b.scope,
        categoryId: b.categoryId ?? null,
        location: b.location ?? null,
        assignedTo: b.assignedTo ?? null,
        createdBy: member.id,
      });
      await tx
        .insert(stockCountLines)
        .values(prods.map((p) => ({ id: newId(), countId: id, productId: p.id })));
    });
    return c.json({ id, lines: prods.length }, 201);
  },
);

countRoutes.get("/counts", requireActor(), requirePermission("count_receive"), async (c) => {
  const db = c.get("db");
  const rows = await db
    .select({
      c: stockCounts,
      assignedName: members.name,
      total: sql<number>`(select count(*) from ${stockCountLines} where ${stockCountLines.countId} = ${stockCounts.id})::int`,
      counted: sql<number>`(select count(*) from ${stockCountLines} where ${stockCountLines.countId} = ${stockCounts.id} and ${stockCountLines.countedQty} is not null)::int`,
    })
    .from(stockCounts)
    .leftJoin(members, eq(members.id, stockCounts.assignedTo))
    .orderBy(desc(stockCounts.createdAt))
    .limit(50);
  return c.json(
    rows.map((r) => ({ ...r.c, assignedName: r.assignedName, total: r.total, counted: r.counted })),
  );
});

/**
 * Detalle. El que cuenta no ve el stock del sistema (conteo ciego); quien revisa ve las
 * diferencias en unidades y en plata (si puede ver costos).
 */
countRoutes.get("/counts/:id", requireActor(), requirePermission("count_receive"), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const [count] = await db.select().from(stockCounts).where(eq(stockCounts.id, id));
  if (!count) throw notFound("Ese conteo no existe.");
  const { member } = actorOf(c);
  const overrides = await loadOverrides(db, member.id);
  const reviewer = effectiveGrant(member.role, "adjust_stock", overrides) === "allow";
  const costs = effectiveGrant(member.role, "view_costs", overrides) === "allow";
  const lines = await db
    .select({
      l: stockCountLines,
      name: products.name,
      saleUnit: products.saleUnit,
      stockQty: products.stockQty,
      costCents: products.costCents,
      location: products.location,
    })
    .from(stockCountLines)
    .innerJoin(products, eq(products.id, stockCountLines.productId))
    .where(eq(stockCountLines.countId, id))
    .orderBy(asc(products.name));
  const codes = await db
    .select()
    .from(barcodes)
    .where(
      inArray(
        barcodes.productId,
        lines.map((l) => l.l.productId),
      ),
    );
  return c.json({
    ...count,
    reviewer,
    lines: lines.map((r) => {
      const system = r.l.systemQty ?? r.stockQty;
      const diff = r.l.countedQty === null ? null : roundQty(r.l.countedQty - system);
      return {
        id: r.l.id,
        productId: r.l.productId,
        name: r.name,
        saleUnit: r.saleUnit,
        location: r.location,
        barcodes: codes.filter((b) => b.productId === r.l.productId).map((b) => b.code),
        countedQty: r.l.countedQty,
        status: r.l.status,
        // Conteo ciego: solo quien revisa ve el sistema y la diferencia.
        ...(reviewer
          ? {
              systemQty: system,
              differenceQty: diff,
              ...(costs && diff !== null && r.costCents != null
                ? { differenceCents: Math.round(diff * r.costCents) }
                : {}),
            }
          : {}),
      };
    }),
  });
});

const lineBody = z.object({ productId: z.uuid(), countedQty: z.number().min(0) });

/** Anotar lo contado de un producto. */
countRoutes.put(
  "/counts/:id/lines",
  requireActor(),
  requirePermission("count_receive"),
  validate("json", lineBody),
  async (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const { productId, countedQty } = c.req.valid("json");
    const [count] = await db.select().from(stockCounts).where(eq(stockCounts.id, id));
    if (!count) throw notFound("Ese conteo no existe.");
    if (count.status !== "open") throw new ApiError(409, "closed", "Ese conteo ya se terminó.");
    const { member } = actorOf(c);
    const updated = await db
      .update(stockCountLines)
      .set({ countedQty: roundQty(countedQty), countedBy: member.id, countedAt: new Date() })
      .where(and(eq(stockCountLines.countId, id), eq(stockCountLines.productId, productId)))
      .returning({ id: stockCountLines.id });
    if (!updated.length)
      throw new ApiError(404, "not_in_count", "Ese producto no está en este conteo.");
    return c.json({ ok: true });
  },
);

/** Terminar de contar: pasa a revisión. */
countRoutes.post(
  "/counts/:id/submit",
  requireActor(),
  requirePermission("count_receive"),
  async (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const [row] = await db
      .update(stockCounts)
      .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(stockCounts.id, id), eq(stockCounts.status, "open")))
      .returning();
    if (!row) throw new ApiError(409, "closed", "Ese conteo no está abierto.");
    return c.json({ ok: true });
  },
);

const approveBody = z.object({ lineIds: z.array(z.uuid()).optional() });

/** Aprobar todo o por línea: lo contado pasa a ser el stock (movimiento de conteo). */
countRoutes.post(
  "/counts/:id/approve",
  requireActor(),
  requireFull("adjust_stock"),
  validate("json", approveBody),
  async (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const { lineIds } = c.req.valid("json");
    const { member, device } = actorOf(c);
    const [count] = await db.select().from(stockCounts).where(eq(stockCounts.id, id));
    if (!count) throw notFound("Ese conteo no existe.");
    if (count.status === "approved" || count.status === "cancelled")
      throw new ApiError(409, "closed", "Ese conteo ya está cerrado.");
    const result = await db.transaction(async (tx) => {
      const lines = await tx.select().from(stockCountLines).where(eq(stockCountLines.countId, id));
      const chosen = lines.filter(
        (l) =>
          l.status === "pending" && l.countedQty !== null && (!lineIds || lineIds.includes(l.id)),
      );
      let moved = 0;
      for (const l of chosen) {
        const [p] = await tx
          .select()
          .from(products)
          .where(eq(products.id, l.productId))
          .for("update");
        if (!p) continue;
        const diff = roundQty((l.countedQty ?? 0) - p.stockQty);
        if (diff !== 0) {
          await applyStock(tx, {
            productId: p.id,
            qty: diff,
            kind: "count",
            reason: count.name,
            refType: "stock_count",
            refId: id,
            memberId: member.id,
            deviceId: device?.id ?? null,
          });
          moved++;
        }
        await tx
          .update(stockCountLines)
          .set({ status: "approved", systemQty: p.stockQty })
          .where(eq(stockCountLines.id, l.id));
      }
      const pendingLeft = (
        await tx
          .select({ id: stockCountLines.id })
          .from(stockCountLines)
          .where(and(eq(stockCountLines.countId, id), eq(stockCountLines.status, "pending")))
      ).length;
      if (!pendingLeft || !lineIds) {
        await tx
          .update(stockCounts)
          .set({
            status: "approved",
            approvedAt: new Date(),
            approvedBy: member.id,
            updatedAt: new Date(),
          })
          .where(eq(stockCounts.id, id));
      }
      return { approved: chosen.length, moved };
    });
    await auditFrom(c, db, {
      action: "stock.count_approved",
      entityType: "stock_count",
      entityId: id,
      after: result,
    });
    return c.json(result);
  },
);
