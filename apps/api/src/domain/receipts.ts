import { addDays, newId, type OpPayload, roundQty, todayAR } from "@mostrador/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  lots,
  products,
  purchaseOrderLines,
  purchaseOrders,
  receiptLines,
  receipts,
  shortages,
  supplierInvoices,
  supplierProducts,
  suppliers,
} from "../db/schema/index";
import { raiseAlert } from "./alerts";
import { upsertProduct } from "./catalog";
import { applyStock } from "./stock";
import { type DbOrTx, need, type OpContext, Rejection } from "./types";

const canAct = (ctx: OpContext, perm: "view_costs" | "change_prices") => {
  const g = ctx.grant(perm);
  return g === "allow" || (g === "pin" && !!ctx.authorizedBy && ctx.canBeAuthorized(perm));
};

/** Costo nuevo de un producto: en la ficha y en el vínculo con el proveedor. */
async function setCost(
  tx: DbOrTx,
  productId: string,
  supplierId: string | null,
  costCents: number,
) {
  await tx
    .update(products)
    .set({ costCents, updatedAt: new Date() })
    .where(eq(products.id, productId));
  if (supplierId) {
    await tx
      .insert(supplierProducts)
      .values({ id: newId(), supplierId, productId, costCents })
      .onConflictDoUpdate({
        target: [supplierProducts.supplierId, supplierProducts.productId],
        set: { costCents, updatedAt: new Date() },
      });
  }
}

/** La cuenta a pagar de la recepción: vence según el plazo del proveedor. */
async function payable(
  tx: DbOrTx,
  receiptId: string,
  supplierId: string | null,
  totalCents: number,
  invoiceNumber: string | null,
  today: string,
) {
  if (!supplierId || totalCents <= 0) return null;
  const [s] = await tx.select().from(suppliers).where(eq(suppliers.id, supplierId));
  const id = newId();
  await tx.insert(supplierInvoices).values({
    id,
    supplierId,
    receiptId,
    kind: invoiceNumber ? "invoice" : "delivery_note",
    number: invoiceNumber,
    issuedOn: today,
    dueOn: addDays(today, s?.paymentTermsDays ?? 0),
    amountCents: totalCents,
  });
  return id;
}

/**
 * Recepción de mercadería: entra el stock (sin los dañados), se cargan lotes y vencimientos,
 * se actualizan costos y el pedido, y se genera la cuenta a pagar. Si quien recibe no ve
 * costos, carga solo cantidades y los costos los completa después el encargado o el dueño.
 */
export async function confirmReceipt(tx: DbOrTx, ctx: OpContext, p: OpPayload<"receipt.confirm">) {
  need(ctx, "count_receive", "Recibir mercadería");
  const [dup] = await tx.select({ id: receipts.id }).from(receipts).where(eq(receipts.id, p.id));
  if (dup) return { receiptId: p.id, duplicate: true };

  const costs = canAct(ctx, "view_costs");
  const prices = canAct(ctx, "change_prices");
  let order: typeof purchaseOrders.$inferSelect | undefined;
  let orderLines: (typeof purchaseOrderLines.$inferSelect)[] = [];
  if (p.orderId) {
    [order] = await tx
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, p.orderId))
      .for("update");
    if (!order) throw new Rejection("El pedido de la recepción no existe");
    if (order.status === "cancelled" || order.status === "closed")
      throw new Rejection(`El pedido ${order.number} está cerrado o cancelado`);
    orderLines = await tx
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.orderId, order.id));
  }
  const supplierId = p.supplierId ?? order?.supplierId ?? null;
  const ids = [...new Set(p.lines.map((l) => l.productId))];
  const prods = await tx.select().from(products).where(inArray(products.id, ids));
  const links = supplierId
    ? await tx
        .select()
        .from(supplierProducts)
        .where(
          and(
            eq(supplierProducts.supplierId, supplierId),
            inArray(supplierProducts.productId, ids),
          ),
        )
    : [];

  const pendingCosts = !costs;
  await tx.insert(receipts).values({
    id: p.id,
    supplierId,
    orderId: order?.id ?? null,
    kind: p.kind,
    status: "confirmed",
    costsPending: pendingCosts,
    photoUrl: p.photoId ? `/api/files/${p.photoId}` : null,
    notes: p.notes ?? null,
    memberId: ctx.memberId,
    deviceId: ctx.deviceId,
    receivedAt: ctx.at,
  });

  let total = 0;
  const priceReview: string[] = [];
  for (const l of p.lines) {
    const prod = prods.find((x) => x.id === l.productId);
    if (!prod) throw new Rejection("Uno de los productos recibidos no existe");
    const damaged = Math.min(l.damagedQty ?? 0, l.qty);
    const good = roundQty(l.qty - damaged);
    const previous =
      links.find((x) => x.productId === l.productId)?.costCents ?? prod.costCents ?? null;
    const cost = costs ? (l.unitCostCents ?? previous) : null;
    let lotId: string | null = null;
    if (l.expiresOn && good > 0) {
      lotId = newId();
      await tx.insert(lots).values({
        id: lotId,
        productId: prod.stockBaseId ?? prod.id,
        code: l.lotCode ?? null,
        expiresOn: l.expiresOn,
        qtyRemaining: good,
        receiptId: p.id,
      });
    }
    if (good > 0) {
      await applyStock(tx, {
        productId: prod.id,
        qty: good,
        kind: "receipt",
        refType: "receipt",
        refId: p.id,
        lotId,
        note: order ? `Pedido ${String(order.number).padStart(4, "0")}` : null,
        memberId: ctx.memberId,
        deviceId: ctx.deviceId,
        deviceAt: ctx.at,
      });
    }
    await tx.insert(receiptLines).values({
      id: l.id,
      receiptId: p.id,
      productId: prod.id,
      orderLineId: l.orderLineId ?? null,
      qty: l.qty,
      damagedQty: damaged,
      unitCostCents: cost,
      previousCostCents: previous,
      lotCode: l.lotCode ?? null,
      expiresOn: l.expiresOn ?? null,
    });
    if (cost != null) {
      total += Math.round(cost * good);
      if (cost !== previous) {
        await setCost(tx, prod.id, supplierId, cost);
        if (l.newPriceCents != null && prices) {
          await upsertProduct(tx, ctx, { id: prod.id, changes: { priceCents: l.newPriceCents } });
        } else {
          priceReview.push(prod.id);
        }
      }
    }
    if (l.orderLineId) {
      const ol = orderLines.find((x) => x.id === l.orderLineId);
      if (ol) {
        ol.qtyReceived = roundQty((ol.qtyReceived ?? 0) + good);
        await tx
          .update(purchaseOrderLines)
          .set({ qtyReceived: ol.qtyReceived })
          .where(eq(purchaseOrderLines.id, ol.id));
      }
    }
  }
  if (priceReview.length)
    await tx.update(products).set({ priceReview: true }).where(inArray(products.id, priceReview));
  // Lo anotado como faltante ya llegó.
  await tx
    .update(shortages)
    .set({ resolvedAt: new Date() })
    .where(and(inArray(shortages.productId, ids), isNull(shortages.resolvedAt)));

  if (order) {
    const complete = orderLines.every(
      (ol) => (ol.qtyReceived ?? 0) >= (ol.qtyConfirmed ?? ol.qtyOrdered),
    );
    const status = complete ? "received" : "partial";
    await tx
      .update(purchaseOrders)
      .set({
        status,
        receivedAt: new Date(),
        timeline: [...order.timeline, { at: ctx.at.toISOString(), status, memberId: ctx.memberId }],
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, order.id));
  }

  await tx.update(receipts).set({ totalCents: total }).where(eq(receipts.id, p.id));
  let invoiceId: string | null = null;
  if (pendingCosts) {
    await raiseAlert(tx, {
      kind: "receipt_costs",
      title: "Hay una recepción para completar costos",
      body: order ? `Pedido ${String(order.number).padStart(4, "0")}` : "Recepción sin pedido",
      refType: "receipt",
      refId: p.id,
      severity: "info",
    });
  } else {
    invoiceId = await payable(
      tx,
      p.id,
      supplierId,
      total,
      p.invoiceNumber ?? null,
      todayAR(ctx.at),
    );
  }
  return {
    receiptId: p.id,
    totalCents: total,
    costsPending: pendingCosts,
    invoiceId,
    orderStatus: order
      ? orderLines.every((ol) => (ol.qtyReceived ?? 0) >= (ol.qtyConfirmed ?? ol.qtyOrdered))
        ? "received"
        : "partial"
      : null,
  };
}

/** El encargado o el dueño completa los costos de una recepción hecha por el repositor. */
export async function completeReceiptCosts(
  tx: DbOrTx,
  ctx: OpContext,
  receiptId: string,
  input: {
    lines: { lineId: string; unitCostCents: number; newPriceCents?: number | null }[];
    invoiceNumber?: string | null;
  },
) {
  if (!canAct(ctx, "view_costs")) throw new Rejection("Completar costos: no tiene permiso");
  const [r] = await tx.select().from(receipts).where(eq(receipts.id, receiptId)).for("update");
  if (!r) throw new Rejection("La recepción no existe");
  if (!r.costsPending) throw new Rejection("Esa recepción ya tiene los costos");
  const lines = await tx.select().from(receiptLines).where(eq(receiptLines.receiptId, receiptId));
  const prods = await tx
    .select()
    .from(products)
    .where(
      inArray(
        products.id,
        lines.map((l) => l.productId),
      ),
    );
  const prices = canAct(ctx, "change_prices");
  let total = 0;
  const review: string[] = [];
  for (const l of lines) {
    const given = input.lines.find((x) => x.lineId === l.id);
    const cost =
      given?.unitCostCents ??
      l.previousCostCents ??
      prods.find((p) => p.id === l.productId)?.costCents ??
      null;
    if (cost == null)
      throw new Rejection(
        `Falta el costo de ${prods.find((p) => p.id === l.productId)?.name ?? "un producto"}`,
      );
    await tx.update(receiptLines).set({ unitCostCents: cost }).where(eq(receiptLines.id, l.id));
    total += Math.round(cost * (l.qty - l.damagedQty));
    if (cost !== l.previousCostCents) {
      await setCost(tx, l.productId, r.supplierId, cost);
      if (given?.newPriceCents != null && prices)
        await upsertProduct(tx, ctx, {
          id: l.productId,
          changes: { priceCents: given.newPriceCents },
        });
      else review.push(l.productId);
    }
  }
  if (review.length)
    await tx.update(products).set({ priceReview: true }).where(inArray(products.id, review));
  await tx
    .update(receipts)
    .set({ costsPending: false, totalCents: total, updatedAt: new Date() })
    .where(eq(receipts.id, receiptId));
  const invoiceId = await payable(
    tx,
    receiptId,
    r.supplierId,
    total,
    input.invoiceNumber ?? null,
    todayAR(),
  );
  return { totalCents: total, invoiceId };
}
