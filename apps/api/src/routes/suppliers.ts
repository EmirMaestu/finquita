import { effectiveGrant, newId } from "@mostrador/shared";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { loadOverrides, requireFull } from "../auth/permissions";
import {
  barcodes,
  products,
  purchaseOrders,
  supplierInvoices,
  supplierProducts,
  suppliers,
} from "../db/schema/index";
import { auditFrom, diff } from "../lib/audit";
import { ApiError, notFound } from "../lib/errors";
import { validate } from "../lib/validate";

export const supplierRoutes = new Hono<AppEnv>();

async function canRead(c: Parameters<typeof actorOf>[0]) {
  const { member } = actorOf(c);
  const o = await loadOverrides(c.get("db"), member.id);
  const ok = ["build_orders", "count_receive", "note_shortages"].some(
    (p) => effectiveGrant(member.role, p as "build_orders", o) !== "deny",
  );
  if (!ok) throw new ApiError(403, "forbidden", "No tenés permiso para ver proveedores.");
  return effectiveGrant(member.role, "view_costs", o) === "allow";
}

/** Saldo a pagar de cada proveedor: facturas sin pagar (las notas de crédito restan). */
async function balances(db: AppEnv["Variables"]["db"]) {
  const rows = await db
    .select({
      supplierId: supplierInvoices.supplierId,
      due: sql<string>`sum(${supplierInvoices.amountCents} - ${supplierInvoices.paidCents})`,
    })
    .from(supplierInvoices)
    .where(ne(supplierInvoices.status, "paid"))
    .groupBy(supplierInvoices.supplierId);
  return new Map(rows.map((r) => [r.supplierId, Number(r.due)]));
}

/** Lista con rubro, días de pedido y entrega, WhatsApp, saldo a pagar y último pedido. */
supplierRoutes.get("/suppliers", requireActor(), async (c) => {
  const costs = await canRead(c);
  const db = c.get("db");
  const rows = await db
    .select()
    .from(suppliers)
    .where(isNull(suppliers.deletedAt))
    .orderBy(asc(suppliers.name));
  if (c.req.query("light")) return c.json(rows.map((s) => ({ id: s.id, name: s.name })));
  const due = await balances(db);
  const last = await db
    .select({
      supplierId: purchaseOrders.supplierId,
      at: sql<string>`max(coalesce(${purchaseOrders.sentAt}, ${purchaseOrders.createdAt}))`,
    })
    .from(purchaseOrders)
    .groupBy(purchaseOrders.supplierId);
  const lastBy = new Map(last.map((l) => [l.supplierId, l.at]));
  return c.json(
    rows.map((s) => ({
      ...s,
      ...(costs ? { balanceCents: due.get(s.id) ?? 0 } : {}),
      lastOrderAt: lastBy.get(s.id) ?? null,
    })),
  );
});

/** Ficha: datos, condiciones, productos con código y costo, pedidos y facturas. */
supplierRoutes.get("/suppliers/:id", requireActor(), async (c) => {
  const costs = await canRead(c);
  const db = c.get("db");
  const id = c.req.param("id");
  const [s] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!s || s.deletedAt) throw notFound("Ese proveedor no existe.");
  const items = await db
    .select({
      sp: supplierProducts,
      name: products.name,
      stockQty: products.stockQty,
      minStock: products.minStock,
      saleUnit: products.saleUnit,
    })
    .from(supplierProducts)
    .innerJoin(products, eq(products.id, supplierProducts.productId))
    .where(and(eq(supplierProducts.supplierId, id), isNull(products.deletedAt)))
    .orderBy(asc(products.name));
  const codes = items.length
    ? await db
        .select()
        .from(barcodes)
        .where(
          inArray(
            barcodes.productId,
            items.map((i) => i.sp.productId),
          ),
        )
    : [];
  const orders = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.supplierId, id))
    .orderBy(desc(purchaseOrders.number))
    .limit(20);
  const invoices = costs
    ? await db
        .select()
        .from(supplierInvoices)
        .where(eq(supplierInvoices.supplierId, id))
        .orderBy(desc(supplierInvoices.issuedOn))
        .limit(30)
    : [];
  const due = (await balances(db)).get(id) ?? 0;
  return c.json({
    ...s,
    ...(costs ? { balanceCents: due } : {}),
    products: items.map((i) => ({
      productId: i.sp.productId,
      name: i.name,
      supplierCode: i.sp.supplierCode,
      packQty: i.sp.packQty,
      isPrimary: i.sp.isPrimary,
      stockQty: i.stockQty,
      minStock: i.minStock,
      saleUnit: i.saleUnit,
      barcode: codes.find((b) => b.productId === i.sp.productId)?.code ?? null,
      ...(costs ? { costCents: i.sp.costCents } : {}),
    })),
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      totalCents: costs ? o.totalCents : undefined,
      expectedOn: o.expectedOn,
      sentAt: o.sentAt,
    })),
    invoices,
  });
});

const supplierBody = z.object({
  name: z.string().min(1).max(80),
  legalName: z.string().max(120).nullable().optional(),
  cuit: z.string().max(20).nullable().optional(),
  category: z.string().max(60).nullable().optional(),
  contactName: z.string().max(60).nullable().optional(),
  whatsapp: z
    .string()
    .max(20)
    .regex(/^\+?\d{8,15}$/, "El WhatsApp va con código de país y área, sin espacios: 5492614000001")
    .nullable()
    .optional(),
  email: z.email().nullable().optional(),
  channel: z.enum(["whatsapp", "manual", "wholesale"]).default("whatsapp"),
  orderDays: z.array(z.number().int().min(0).max(6)).default([]),
  deliveryDays: z.array(z.number().int().min(0).max(6)).default([]),
  scheduleNote: z.string().max(120).nullable().optional(),
  leadDays: z.number().int().min(0).max(60).nullable().optional(),
  minOrderCents: z.number().int().min(0).nullable().optional(),
  paymentTermsDays: z.number().int().min(0).max(180).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

supplierRoutes.post(
  "/suppliers",
  requireActor(),
  requireFull("build_orders"),
  validate("json", supplierBody),
  async (c) => {
    const b = c.req.valid("json");
    const id = newId();
    await c
      .get("db")
      .insert(suppliers)
      .values({ id, ...b, whatsapp: b.whatsapp?.replace("+", "") ?? null });
    await auditFrom(c, c.get("db"), {
      action: "supplier.created",
      entityType: "supplier",
      entityId: id,
      after: b,
    });
    return c.json({ id }, 201);
  },
);

supplierRoutes.patch(
  "/suppliers/:id",
  requireActor(),
  requireFull("build_orders"),
  validate("json", supplierBody.partial()),
  async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const [before] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    if (!before || before.deletedAt) throw notFound("Ese proveedor no existe.");
    const b = c.req.valid("json");
    const [after] = await db
      .update(suppliers)
      .set({
        ...b,
        ...(b.whatsapp !== undefined ? { whatsapp: b.whatsapp?.replace("+", "") ?? null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(suppliers.id, id))
      .returning();
    await auditFrom(c, db, {
      action: "supplier.updated",
      entityType: "supplier",
      entityId: id,
      ...diff(before as never, after as never),
    });
    return c.json(after);
  },
);

supplierRoutes.delete("/suppliers/:id", requireActor(), requireFull("build_orders"), async (c) => {
  const id = c.req.param("id");
  const [row] = await c
    .get("db")
    .update(suppliers)
    .set({ deletedAt: new Date(), active: false })
    .where(eq(suppliers.id, id))
    .returning();
  if (!row) throw notFound("Ese proveedor no existe.");
  await auditFrom(c, c.get("db"), {
    action: "supplier.deleted",
    entityType: "supplier",
    entityId: id,
  });
  return c.json({ ok: true });
});

const productLink = z.object({
  productId: z.uuid(),
  supplierCode: z.string().max(40).nullable().optional(),
  costCents: z.number().int().min(0).nullable().optional(),
  packQty: z.number().positive().nullable().optional(),
  isPrimary: z.boolean().optional(),
});

/** Producto del proveedor: su código y su costo (uno principal y alternativos). */
supplierRoutes.put(
  "/suppliers/:id/products",
  requireActor(),
  requireFull("build_orders"),
  validate("json", productLink),
  async (c) => {
    const supplierId = c.req.param("id");
    const b = c.req.valid("json");
    const db = c.get("db");
    await db.transaction(async (tx) => {
      if (b.isPrimary) {
        await tx
          .update(supplierProducts)
          .set({ isPrimary: false })
          .where(eq(supplierProducts.productId, b.productId));
      }
      await tx
        .insert(supplierProducts)
        .values({
          id: newId(),
          supplierId,
          productId: b.productId,
          supplierCode: b.supplierCode ?? null,
          costCents: b.costCents ?? null,
          packQty: b.packQty ?? null,
          isPrimary: b.isPrimary ?? false,
        })
        .onConflictDoUpdate({
          target: [supplierProducts.supplierId, supplierProducts.productId],
          set: {
            ...(b.supplierCode !== undefined ? { supplierCode: b.supplierCode } : {}),
            ...(b.costCents !== undefined ? { costCents: b.costCents } : {}),
            ...(b.packQty !== undefined ? { packQty: b.packQty } : {}),
            ...(b.isPrimary !== undefined ? { isPrimary: b.isPrimary } : {}),
            updatedAt: new Date(),
          },
        });
    });
    return c.json({ ok: true });
  },
);

supplierRoutes.delete(
  "/suppliers/:id/products/:productId",
  requireActor(),
  requireFull("build_orders"),
  async (c) => {
    const { id, productId } = c.req.param();
    await c
      .get("db")
      .delete(supplierProducts)
      .where(and(eq(supplierProducts.supplierId, id), eq(supplierProducts.productId, productId)));
    return c.json({ ok: true });
  },
);
