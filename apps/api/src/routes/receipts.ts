import { DEFAULT_PRICING, effectiveGrant, newId, OP_PAYLOADS } from "@mostrador/shared";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { loadOverrides, requirePermission } from "../auth/permissions";
import {
  barcodes,
  categories,
  members,
  products,
  purchaseOrderLines,
  purchaseOrders,
  receiptLines,
  receipts,
  settings,
  supplierProducts,
  suppliers,
} from "../db/schema/index";
import { completeReceiptCosts, confirmReceipt } from "../domain/receipts";
import { runDomain } from "../domain/request";
import { auditFrom } from "../lib/audit";
import { notFound } from "../lib/errors";
import { validate } from "../lib/validate";

export const receiptRoutes = new Hono<AppEnv>();

type Ctx = Parameters<typeof actorOf>[0];
const OPEN = ["sent", "confirmed", "changed", "partial"] as const;

async function seesCosts(c: Ctx) {
  const { member } = actorOf(c);
  return (
    effectiveGrant(member.role, "view_costs", await loadOverrides(c.get("db"), member.id)) ===
    "allow"
  );
}

/** Recepciones esperadas: pedidos enviados o confirmados que todavía no llegaron completos. */
receiptRoutes.get(
  "/receipts/expected",
  requireActor(),
  requirePermission("count_receive"),
  async (c) => {
    const rows = await c
      .get("db")
      .select({ o: purchaseOrders, supplierName: suppliers.name })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(inArray(purchaseOrders.status, [...OPEN]))
      .orderBy(asc(purchaseOrders.expectedOn), asc(purchaseOrders.number));
    return c.json(
      rows.map((r) => ({
        id: r.o.id,
        number: r.o.number,
        status: r.o.status,
        expectedOn: r.o.expectedOn,
        supplierId: r.o.supplierId,
        supplierName: r.supplierName,
      })),
    );
  },
);

/** Datos para recibir: lo pedido (y confirmado), con códigos, lote y lo necesario para avisar si el costo cambió. */
receiptRoutes.get(
  "/receipts/order/:id",
  requireActor(),
  requirePermission("count_receive"),
  async (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const costs = await seesCosts(c);
    const [row] = await db
      .select({ o: purchaseOrders, s: suppliers })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(eq(purchaseOrders.id, id));
    if (!row) throw notFound("Ese pedido no existe.");
    const lines = await db
      .select({ l: purchaseOrderLines, p: products, spCost: supplierProducts.costCents })
      .from(purchaseOrderLines)
      .innerJoin(products, eq(products.id, purchaseOrderLines.productId))
      .leftJoin(
        supplierProducts,
        and(
          eq(supplierProducts.productId, purchaseOrderLines.productId),
          eq(supplierProducts.supplierId, row.o.supplierId),
        ),
      )
      .where(eq(purchaseOrderLines.orderId, id))
      .orderBy(asc(purchaseOrderLines.description));
    const codes = lines.length
      ? await db
          .select()
          .from(barcodes)
          .where(
            inArray(
              barcodes.productId,
              lines.map((l) => l.p.id),
            ),
          )
      : [];
    const margins = await marginsFor(
      db,
      lines.map((l) => l.p),
    );
    return c.json({
      id: row.o.id,
      number: row.o.number,
      status: row.o.status,
      expectedOn: row.o.expectedOn,
      supplier: { id: row.s.id, name: row.s.name },
      lines: lines.map(({ l, p, spCost }) => ({
        orderLineId: l.id,
        productId: p.id,
        name: l.description,
        unit: p.saleUnit === "unit" ? "unit" : "kg",
        ordered: l.qtyConfirmed ?? l.qtyOrdered,
        alreadyReceived: l.qtyReceived ?? 0,
        tracksExpiry: p.tracksExpiry,
        barcodes: codes.filter((b) => b.productId === p.id).map((b) => b.code),
        priceCents: p.priceCents,
        ...(costs ? { costCents: spCost ?? p.costCents, marginBp: margins.get(p.id) } : {}),
      })),
    });
  },
);

async function marginsFor(
  db: AppEnv["Variables"]["db"],
  ps: { id: string; marginBp: number | null; categoryId: string | null }[],
) {
  const cats = await db.select().from(categories);
  const [pricing] = await db.select().from(settings).where(eq(settings.key, "pricing"));
  const def =
    (pricing?.value as { defaultMarginBp?: number } | undefined)?.defaultMarginBp ??
    DEFAULT_PRICING.defaultMarginBp;
  const catMargin = (id: string | null): number | null => {
    const cat = cats.find((x) => x.id === id);
    if (!cat) return null;
    return cat.defaultMarginBp ?? catMargin(cat.parentId);
  };
  return new Map(ps.map((p) => [p.id, p.marginBp ?? catMargin(p.categoryId) ?? def]));
}

/** Margen objetivo de productos sueltos (recepción sin pedido). */
receiptRoutes.post(
  "/receipts/margins",
  requireActor(),
  requirePermission("count_receive"),
  validate("json", z.object({ ids: z.array(z.uuid()).max(500) })),
  async (c) => {
    if (!(await seesCosts(c))) return c.json({});
    const db = c.get("db");
    const ids = c.req.valid("json").ids;
    const ps = ids.length ? await db.select().from(products).where(inArray(products.id, ids)) : [];
    return c.json(Object.fromEntries(await marginsFor(db, ps)));
  },
);

const listQuery = z.object({ costsPending: z.enum(["1", "0"]).optional() });

receiptRoutes.get(
  "/receipts",
  requireActor(),
  requirePermission("count_receive"),
  validate("query", listQuery),
  async (c) => {
    const { costsPending } = c.req.valid("query");
    const costs = await seesCosts(c);
    const rows = await c
      .get("db")
      .select({
        r: receipts,
        supplierName: suppliers.name,
        by: members.name,
        orderNumber: purchaseOrders.number,
      })
      .from(receipts)
      .leftJoin(suppliers, eq(suppliers.id, receipts.supplierId))
      .leftJoin(members, eq(members.id, receipts.memberId))
      .leftJoin(purchaseOrders, eq(purchaseOrders.id, receipts.orderId))
      .where(costsPending === "1" ? eq(receipts.costsPending, true) : undefined)
      .orderBy(desc(receipts.receivedAt))
      .limit(100);
    return c.json(
      rows.map((x) => ({
        ...x.r,
        totalCents: costs ? x.r.totalCents : undefined,
        supplierName: x.supplierName,
        by: x.by,
        orderNumber: x.orderNumber,
      })),
    );
  },
);

receiptRoutes.get(
  "/receipts/:id",
  requireActor(),
  requirePermission("count_receive"),
  async (c) => {
    const db = c.get("db");
    const costs = await seesCosts(c);
    const [r] = await db
      .select()
      .from(receipts)
      .where(eq(receipts.id, c.req.param("id")));
    if (!r) throw notFound("Esa recepción no existe.");
    const lines = await db
      .select({ l: receiptLines, p: products })
      .from(receiptLines)
      .innerJoin(products, eq(products.id, receiptLines.productId))
      .where(eq(receiptLines.receiptId, r.id))
      .orderBy(asc(products.name));
    const margins = costs
      ? await marginsFor(
          db,
          lines.map((l) => l.p),
        )
      : new Map();
    return c.json({
      ...r,
      totalCents: costs ? r.totalCents : undefined,
      lines: lines.map(({ l, p }) => ({
        ...l,
        name: p.name,
        unit: p.saleUnit === "unit" ? "unit" : "kg",
        priceCents: p.priceCents,
        unitCostCents: costs ? l.unitCostCents : undefined,
        previousCostCents: costs ? l.previousCostCents : undefined,
        marginBp: costs ? margins.get(p.id) : undefined,
      })),
    });
  },
);

/** Recepción por la API (la app la manda por la cola de sincronización, igual que las ventas). */
receiptRoutes.post("/receipts", requireActor(), requirePermission("count_receive"), async (c) => {
  const body = OP_PAYLOADS["receipt.confirm"].parse({ id: newId(), ...(await c.req.json()) });
  const r = await runDomain(c, (tx, ctx) => confirmReceipt(tx, ctx, body));
  return c.json(r, 201);
});

const costsBody = z.object({
  lines: z.array(
    z.object({
      lineId: z.uuid(),
      unitCostCents: z.number().int().min(0),
      newPriceCents: z.number().int().min(0).nullable().optional(),
    }),
  ),
  invoiceNumber: z.string().max(40).nullable().optional(),
});

receiptRoutes.post(
  "/receipts/:id/costs",
  requireActor(),
  requirePermission("view_costs"),
  validate("json", costsBody),
  async (c) => {
    const id = c.req.param("id");
    const r = await runDomain(c, (tx, ctx) =>
      completeReceiptCosts(tx, ctx, id, c.req.valid("json")),
    );
    await auditFrom(c, c.get("db"), {
      action: "receipt.costs",
      entityType: "receipt",
      entityId: id,
      after: r,
    });
    return c.json(r);
  },
);
