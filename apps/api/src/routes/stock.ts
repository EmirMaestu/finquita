import { addDays, arDateTime, effectiveGrant, newId } from "@mostrador/shared";
import { and, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { loadOverrides, requirePermission } from "../auth/permissions";
import { alerts, members, products, stockMovements } from "../db/schema/index";
import { adjustStock } from "../domain/catalog";
import { runDomain } from "../domain/request";
import { reviewAdjustment } from "../domain/stock";
import { auditFrom } from "../lib/audit";
import { ApiError } from "../lib/errors";
import { validate } from "../lib/validate";

export const stockRoutes = new Hono<AppEnv>();

const listQuery = z.object({
  productId: z.uuid().optional(),
  kind: z.enum(["sale", "return", "receipt", "adjustment", "waste", "count", "void"]).optional(),
  status: z.enum(["applied", "pending", "rejected"]).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/** Movimientos de stock: fecha, tipo, cantidad con signo, stock resultante, usuario y referencia. */
stockRoutes.get("/stock/movements", requireActor(), validate("query", listQuery), async (c) => {
  const db = c.get("db");
  const f = c.req.valid("query");
  const where: SQL[] = [];
  if (f.productId) where.push(eq(stockMovements.productId, f.productId));
  if (f.kind) where.push(eq(stockMovements.kind, f.kind));
  if (f.status) where.push(eq(stockMovements.status, f.status));
  if (f.from) where.push(gte(stockMovements.createdAt, arDateTime(f.from)));
  if (f.to) where.push(lt(stockMovements.createdAt, arDateTime(addDays(f.to, 1))));
  const rows = await db
    .select({
      m: stockMovements,
      productName: products.name,
      saleUnit: products.saleUnit,
      memberName: members.name,
      costCents: products.costCents,
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .leftJoin(members, eq(members.id, stockMovements.memberId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(f.limit);
  const { member } = actorOf(c);
  const costs =
    effectiveGrant(member.role, "view_costs", await loadOverrides(db, member.id)) === "allow";
  return c.json(
    rows.map((r) => ({
      ...r.m,
      productName: r.productName,
      saleUnit: r.saleUnit,
      memberName: r.memberName,
      ...(costs && r.costCents != null ? { valueCents: Math.round(r.costCents * r.m.qty) } : {}),
    })),
  );
});

const adjustBody = z.object({
  productId: z.uuid(),
  qty: z.number().optional(),
  realQty: z.number().optional(),
  reason: z.enum([
    "waste",
    "breakage",
    "expired",
    "missing",
    "internal_use",
    "load_error",
    "other",
  ]),
  note: z.string().max(500).nullable().optional(),
});

/** Ajuste con motivo (con conexión). Sin conexión, la app lo manda por la cola. */
stockRoutes.post("/stock/adjustments", requireActor(), validate("json", adjustBody), async (c) => {
  const body = c.req.valid("json");
  const r = await runDomain(c, (tx, ctx) => adjustStock(tx, ctx, { id: newId(), ...body }));
  return c.json(r, 201);
});

/** Ajustes del repositor que esperan aprobación. */
stockRoutes.get("/stock/pending", requireActor(), requirePermission("adjust_stock"), async (c) => {
  const rows = await c
    .get("db")
    .select({
      m: stockMovements,
      productName: products.name,
      saleUnit: products.saleUnit,
      memberName: members.name,
      stockQty: products.stockQty,
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .leftJoin(members, eq(members.id, stockMovements.memberId))
    .where(eq(stockMovements.status, "pending"))
    .orderBy(desc(stockMovements.createdAt));
  return c.json(
    rows.map((r) => ({
      ...r.m,
      productName: r.productName,
      saleUnit: r.saleUnit,
      memberName: r.memberName,
      stockQty: r.stockQty,
    })),
  );
});

const reviewBody = z.object({ approve: z.boolean() });

/** Aprobar o rechazar: solo quien puede ajustar sin aprobación (encargado o dueño). */
stockRoutes.post(
  "/stock/movements/:id/review",
  requireActor(),
  validate("json", reviewBody),
  async (c) => {
    const { member } = actorOf(c);
    const db = c.get("db");
    if (
      effectiveGrant(member.role, "adjust_stock", await loadOverrides(db, member.id)) !== "allow"
    ) {
      throw new ApiError(403, "forbidden", "Los ajustes los aprueba un encargado o el dueño.");
    }
    const { approve } = c.req.valid("json");
    const id = c.req.param("id");
    const r = await runDomain(c, (tx) =>
      reviewAdjustment(tx, { movementId: id, approve, memberId: member.id }),
    );
    await auditFrom(c, db, {
      action: approve ? "stock.adjustment_approved" : "stock.adjustment_rejected",
      entityType: "stock_movement",
      entityId: id,
      after: r,
    });
    // Si no queda ninguno pendiente, el aviso se da por resuelto.
    const [left] = await db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(eq(stockMovements.status, "pending"))
      .limit(1);
    if (!left)
      await db
        .update(alerts)
        .set({ status: "resolved", resolvedAt: new Date(), resolvedBy: member.id })
        .where(eq(alerts.dedupeKey, "adjustment_pending"));
    return c.json(r);
  },
);
