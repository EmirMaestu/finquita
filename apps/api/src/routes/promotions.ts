import { addDays, newId, todayAR } from "@mostrador/shared";
import { and, asc, eq, gt, isNull, lte } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { requireFull, requirePermission } from "../auth/permissions";
import { lots, products, promotionProducts, promotions } from "../db/schema/index";
import { applyStock } from "../domain/stock";
import { auditFrom } from "../lib/audit";
import { notFound } from "../lib/errors";
import { validate } from "../lib/validate";

export const promotionRoutes = new Hono<AppEnv>();

const promoBody = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum([
    "two_for_one",
    "three_for_two",
    "nth_unit",
    "category_percent",
    "combo",
    "weekday",
  ]),
  params: z
    .object({
      n: z.number().int().min(2).max(10).optional(),
      percentBp: z.number().int().min(1).max(10000).optional(),
      comboPriceCents: z.number().int().min(0).optional(),
    })
    .default({}),
  categoryId: z.uuid().nullable().optional(),
  products: z
    .array(z.object({ productId: z.uuid(), qty: z.number().positive().default(1) }))
    .default([]),
  startsOn: z.iso.date().nullable().optional(),
  endsOn: z.iso.date().nullable().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  active: z.boolean().default(true),
});

promotionRoutes.get("/promotions", requireActor(), async (c) => {
  const db = c.get("db");
  const rows = await db
    .select()
    .from(promotions)
    .where(isNull(promotions.deletedAt))
    .orderBy(asc(promotions.name));
  const items = await db
    .select({ pp: promotionProducts, name: products.name })
    .from(promotionProducts)
    .innerJoin(products, eq(products.id, promotionProducts.productId));
  return c.json(
    rows.map((p) => ({
      ...p,
      products: items
        .filter((i) => i.pp.promotionId === p.id)
        .map((i) => ({ productId: i.pp.productId, qty: i.pp.qty, name: i.name })),
    })),
  );
});

async function save(
  c: Parameters<typeof actorOf>[0],
  id: string,
  b: z.infer<typeof promoBody>,
  create: boolean,
) {
  const db = c.get("db");
  await db.transaction(async (tx) => {
    const values = {
      name: b.name,
      kind: b.kind,
      params: b.params,
      categoryId: b.categoryId ?? null,
      startsOn: b.startsOn ?? null,
      endsOn: b.endsOn ?? null,
      weekdays: b.weekdays ?? null,
      active: b.active,
      updatedAt: new Date(),
    };
    if (create) await tx.insert(promotions).values({ id, ...values });
    else await tx.update(promotions).set(values).where(eq(promotions.id, id));
    await tx.delete(promotionProducts).where(eq(promotionProducts.promotionId, id));
    if (b.products.length)
      await tx
        .insert(promotionProducts)
        .values(b.products.map((p) => ({ promotionId: id, productId: p.productId, qty: p.qty })));
  });
}

promotionRoutes.post(
  "/promotions",
  requireActor(),
  requirePermission("change_prices"),
  validate("json", promoBody),
  async (c) => {
    const b = c.req.valid("json");
    const id = newId();
    await save(c, id, b, true);
    await auditFrom(c, c.get("db"), {
      action: "promotion.created",
      entityType: "promotion",
      entityId: id,
      after: b,
    });
    return c.json({ id }, 201);
  },
);

promotionRoutes.put(
  "/promotions/:id",
  requireActor(),
  requirePermission("change_prices"),
  validate("json", promoBody),
  async (c) => {
    const id = c.req.param("id");
    const [p] = await c.get("db").select().from(promotions).where(eq(promotions.id, id));
    if (!p) throw notFound("Esa promoción no existe.");
    await save(c, id, c.req.valid("json"), false);
    await auditFrom(c, c.get("db"), {
      action: "promotion.updated",
      entityType: "promotion",
      entityId: id,
      after: c.req.valid("json"),
    });
    return c.json({ ok: true });
  },
);

promotionRoutes.delete(
  "/promotions/:id",
  requireActor(),
  requirePermission("change_prices"),
  async (c) => {
    const id = c.req.param("id");
    await c
      .get("db")
      .update(promotions)
      .set({ deletedAt: new Date(), active: false })
      .where(eq(promotions.id, id));
    return c.json({ ok: true });
  },
);

const lotsQuery = z.object({ within: z.coerce.number().int().min(0).max(365).default(30) });

/** Vencimientos: lotes con stock que vencen dentro de N días (y los vencidos). */
promotionRoutes.get("/lots", requireActor(), validate("query", lotsQuery), async (c) => {
  const { within } = c.req.valid("query");
  const today = todayAR();
  const rows = await c
    .get("db")
    .select({
      l: lots,
      name: products.name,
      saleUnit: products.saleUnit,
      priceCents: products.priceCents,
    })
    .from(lots)
    .innerJoin(products, eq(products.id, lots.productId))
    .where(and(gt(lots.qtyRemaining, 0), lte(lots.expiresOn, addDays(today, within))))
    .orderBy(asc(lots.expiresOn));
  return c.json(
    rows.map((r) => ({
      ...r.l,
      productName: r.name,
      saleUnit: r.saleUnit,
      priceCents: r.priceCents,
      expired: r.l.expiresOn < today,
    })),
  );
});

const lotAction = z.object({
  action: z.enum(["waste", "supplier"]),
  note: z.string().max(200).optional(),
});

/** Dar de baja como merma o devolver al proveedor: sale del stock y el lote queda en cero. */
promotionRoutes.post(
  "/lots/:id/remove",
  requireActor(),
  requireFull("adjust_stock"),
  validate("json", lotAction),
  async (c) => {
    const id = c.req.param("id");
    const { action, note } = c.req.valid("json");
    const db = c.get("db");
    const { member, device } = actorOf(c);
    const r = await db.transaction(async (tx) => {
      const [l] = await tx.select().from(lots).where(eq(lots.id, id)).for("update");
      if (!l) throw notFound("Ese lote no existe.");
      await applyStock(tx, {
        productId: l.productId,
        qty: -l.qtyRemaining,
        kind: action === "waste" ? "waste" : "adjustment",
        reason: action === "waste" ? "expired" : "supplier_return",
        note: note ?? (action === "waste" ? "Baja por vencimiento" : "Devuelto al proveedor"),
        lotId: l.id,
        memberId: member.id,
        deviceId: device?.id ?? null,
      });
      await tx.update(lots).set({ qtyRemaining: 0, updatedAt: new Date() }).where(eq(lots.id, id));
      return { removed: l.qtyRemaining };
    });
    await auditFrom(c, db, { action: `lot.${action}`, entityType: "lot", entityId: id, after: r });
    return c.json(r);
  },
);
