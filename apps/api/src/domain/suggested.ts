import {
  DEFAULT_PRICING,
  deliveryWindow,
  explainSuggestion,
  type SuggestInput,
  suggestQty,
  todayAR,
} from "@mostrador/shared";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  products,
  purchaseOrderLines,
  purchaseOrders,
  saleLines,
  sales,
  settings,
  shortages,
  supplierProducts,
  suppliers,
} from "../db/schema/index";
import type { DbOrTx } from "./types";

export type SuggestedLine = {
  productId: string;
  name: string;
  unit: "unit" | "kg";
  stock: number;
  minStock: number | null;
  dailySales: number;
  onOrder: number;
  shortage: boolean;
  packQty: number | null;
  packName: string | null;
  suggested: number;
  packs: number | null;
  reason: "sales" | "minimum" | "shortage";
  explanation: string;
  costCents: number | null;
};

export type SuggestedOrder = {
  supplierId: string;
  supplierName: string;
  delivery: string;
  following: string;
  daysToCover: number;
  minOrderCents: number | null;
  lines: SuggestedLine[];
  totalCents: number;
};

const OPEN: ("sent" | "confirmed" | "changed" | "partial")[] = [
  "sent",
  "confirmed",
  "changed",
  "partial",
];

/** Pedido sugerido de todos los proveedores (o de uno): productos debajo del mínimo o que no llegan. */
export async function suggestedOrders(
  db: Db | DbOrTx,
  opts: { supplierId?: string; today?: string } = {},
): Promise<SuggestedOrder[]> {
  const today = opts.today ?? todayAR();
  const [pricing] = await db.select().from(settings).where(eq(settings.key, "pricing"));
  const reserveDays =
    (pricing?.value as { reserveDays?: number } | undefined)?.reserveDays ??
    DEFAULT_PRICING.reserveDays;

  const sups = await db
    .select()
    .from(suppliers)
    .where(
      and(
        isNull(suppliers.deletedAt),
        opts.supplierId ? eq(suppliers.id, opts.supplierId) : undefined,
      ),
    );
  if (!sups.length) return [];
  const links = await db
    .select({ sp: supplierProducts, p: products })
    .from(supplierProducts)
    .innerJoin(products, eq(products.id, supplierProducts.productId))
    .where(and(isNull(products.deletedAt), eq(products.active, true)));
  // Cada producto va con su proveedor principal (o con el único que tiene).
  const owner = new Map<string, string>();
  for (const l of links)
    if (l.sp.isPrimary || !owner.has(l.p.id)) owner.set(l.p.id, l.sp.supplierId);

  const since = new Date(Date.now() - 28 * 86_400_000);
  const sold = await db
    .select({
      productId: saleLines.productId,
      qty: sql<string>`sum(${saleLines.qty} - ${saleLines.returnedQty})`,
    })
    .from(saleLines)
    .innerJoin(sales, eq(sales.id, saleLines.saleId))
    .where(and(eq(sales.status, "completed"), gte(sales.deviceAt, since)))
    .groupBy(saleLines.productId);
  const soldBy = new Map(sold.map((s) => [s.productId, Number(s.qty) / 28]));
  const ordered = await db
    .select({
      productId: purchaseOrderLines.productId,
      qty: sql<string>`sum(greatest(coalesce(${purchaseOrderLines.qtyConfirmed}, ${purchaseOrderLines.qtyOrdered}) - coalesce(${purchaseOrderLines.qtyReceived}, 0), 0))`,
    })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.orderId))
    .where(inArray(purchaseOrders.status, OPEN))
    .groupBy(purchaseOrderLines.productId);
  const onOrderBy = new Map(ordered.map((o) => [o.productId, Number(o.qty)]));
  const short = new Set(
    (
      await db
        .select({ productId: shortages.productId })
        .from(shortages)
        .where(isNull(shortages.resolvedAt))
    ).map((s) => s.productId),
  );

  return sups.map((s) => {
    const w = deliveryWindow(today, s.deliveryDays, reserveDays, s.leadDays);
    const lines: SuggestedLine[] = [];
    for (const { sp, p } of links) {
      if (sp.supplierId !== s.id || owner.get(p.id) !== s.id) continue;
      const unit = p.saleUnit === "unit" ? "unit" : "kg";
      const packQty = sp.packQty ?? p.purchaseUnitQty ?? null;
      const input: SuggestInput = {
        dailySales: Math.round((soldBy.get(p.id) ?? 0) * 1000) / 1000,
        daysToCover: w.daysToCover,
        stock: p.stockQty,
        onOrder: onOrderBy.get(p.id) ?? 0,
        minStock: p.minStock,
        packQty,
        shortage: short.has(p.id),
        unit,
      };
      const r = suggestQty(input);
      if (!r.qty || !r.reason) continue;
      const packName = p.purchaseUnitName ?? null;
      lines.push({
        productId: p.id,
        name: p.name,
        unit,
        stock: p.stockQty,
        minStock: p.minStock,
        dailySales: input.dailySales,
        onOrder: input.onOrder,
        shortage: input.shortage ?? false,
        packQty,
        packName,
        suggested: r.qty,
        packs: r.packs,
        reason: r.reason,
        explanation: explainSuggestion(input, r, packName ?? "caja"),
        costCents: sp.costCents ?? p.costCents ?? null,
      });
    }
    lines.sort((a, b) => a.name.localeCompare(b.name, "es"));
    const totalCents = lines.reduce((t, l) => t + Math.round((l.costCents ?? 0) * l.suggested), 0);
    return {
      supplierId: s.id,
      supplierName: s.name,
      delivery: w.delivery,
      following: w.following,
      daysToCover: w.daysToCover,
      minOrderCents: s.minOrderCents,
      lines,
      totalCents,
    };
  });
}
