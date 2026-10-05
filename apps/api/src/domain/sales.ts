import { formatMoney, type OpPayload, roundQty } from "@mostrador/shared";
import { and, eq, inArray } from "drizzle-orm";
import {
  cashMovements,
  customers,
  members,
  products,
  registers,
  saleLines,
  salePayments,
  saleReturnLines,
  saleReturns,
  sales,
} from "../db/schema/index";
import { raiseAlert } from "./alerts";
import { addCash, getShift, openShiftOf } from "./cash";
import { chargeCredit, creditDown, getCustomer } from "./credit";
import { applyStock } from "./stock";
import { type DbOrTx, need, type OpContext, Rejection } from "./types";

export type Sale = typeof sales.$inferSelect;

/**
 * Registra una venta tal como ocurrió: con los precios con que se vendió, aunque el
 * catálogo haya cambiado. El stock puede quedar negativo (se avisa) y el fiado sobre el
 * límite sin conexión se acepta y se avisa.
 */
export async function createSale(tx: DbOrTx, ctx: OpContext, p: OpPayload<"sale.create">) {
  need(ctx, "sell", "Vender");
  const [dup] = await tx.select({ id: sales.id }).from(sales).where(eq(sales.id, p.id));
  if (dup) throw new Rejection("La venta ya estaba registrada");
  const [reg] = await tx.select().from(registers).where(eq(registers.id, p.registerId));
  if (!reg) throw new Rejection("La caja no existe");
  if (!p.shiftId) throw new Rejection("La venta no tiene turno de caja: abrí la caja para vender");
  const shift = await getShift(tx, p.shiftId);
  if (shift.registerId !== p.registerId) throw new Rejection("El turno es de otra caja");
  if (p.customerId) await getCustomer(tx, p.customerId);

  const productIds = [...new Set(p.lines.map((l) => l.productId).filter((x): x is string => !!x))];
  const prods = productIds.length
    ? await tx.select().from(products).where(inArray(products.id, productIds))
    : [];
  const byId = new Map(prods.map((x) => [x.id, x]));
  for (const id of productIds) {
    if (!byId.has(id)) throw new Rejection("Un producto de la venta no existe");
  }

  await tx.insert(sales).values({
    id: p.id,
    registerId: p.registerId,
    shiftId: p.shiftId,
    number: p.number,
    memberId: ctx.memberId,
    customerId: p.customerId,
    status: "completed",
    subtotalCents: p.subtotalCents,
    discountCents: p.discountCents,
    surchargeCents: p.surchargeCents,
    totalCents: p.totalCents,
    changeCents: p.changeCents,
    receiptType: p.receiptType,
    note: p.note ?? null,
    deviceId: ctx.deviceId,
    deviceAt: ctx.at,
    clockSkew: ctx.clockSkew,
    authorizedBy: ctx.authorizedBy,
    createdAt: ctx.at,
  });
  await tx.insert(saleLines).values(
    p.lines.map((l, i) => ({
      id: l.id,
      saleId: p.id,
      position: i,
      kind: l.kind,
      productId: l.productId,
      categoryId: l.categoryId ?? (l.productId ? byId.get(l.productId)?.categoryId : null) ?? null,
      description: l.description,
      qty: l.qty,
      unit: l.unit,
      unitPriceCents: l.unitPriceCents,
      discountCents: l.discountCents,
      totalCents: l.totalCents,
      unitCostCents: l.productId ? (byId.get(l.productId)?.costCents ?? null) : null,
      promotionId: l.promotionId ?? null,
      note: l.note ?? null,
    })),
  );
  await tx.insert(salePayments).values(
    p.payments.map((pay) => ({
      id: pay.id,
      saleId: p.id,
      method: pay.method,
      amountCents: pay.amountCents,
      tenderedCents: pay.tenderedCents ?? null,
      surchargeCents: pay.surchargeCents,
      verified: pay.verified,
      customerId: pay.method === "account" ? (pay.customerId ?? p.customerId) : null,
    })),
  );

  for (const l of p.lines) {
    if (!l.productId || (l.kind !== "product" && l.kind !== "container")) continue;
    await applyStock(tx, {
      productId: l.productId,
      qty: -l.qty,
      kind: "sale",
      refType: "sale",
      refId: p.id,
      memberId: ctx.memberId,
      deviceId: ctx.deviceId,
      deviceAt: ctx.at,
    });
  }

  // Un movimiento de caja por medio de pago; el vuelto sale del efectivo.
  let change = p.changeCents;
  for (const pay of p.payments) {
    let amount = pay.amountCents;
    if (pay.method === "cash" && change > 0) {
      const used = Math.min(change, amount);
      amount -= used;
      change -= used;
    }
    if (amount === 0) continue;
    await addCash(tx, {
      shiftId: p.shiftId,
      kind: "sale",
      method: pay.method,
      amountCents: amount,
      refType: "sale",
      refId: p.id,
      memberId: ctx.memberId,
      authorizedBy: ctx.authorizedBy,
      deviceId: ctx.deviceId,
      at: ctx.at,
    });
  }

  let credit: { overLimit: boolean; balanceAfter: number } | null = null;
  const fiado = p.payments
    .filter((x) => x.method === "account")
    .reduce((a, x) => a + x.amountCents, 0);
  if (fiado > 0) {
    const customerId = p.customerId;
    if (!customerId) throw new Rejection("El fiado necesita un cliente");
    credit = await chargeCredit(tx, ctx, { customerId, amountCents: fiado, saleId: p.id });
  }

  if (ctx.clockSkew) {
    await raiseAlert(tx, {
      kind: "clock_skew",
      title: "La hora de un dispositivo no coincide con la del servidor",
      body: "Hay ventas marcadas: revisá la fecha y hora del dispositivo.",
      refType: "device",
      refId: ctx.deviceId,
      dedupeKey: `clock_skew:${ctx.deviceId ?? "?"}`,
    });
  }
  return { saleId: p.id, number: p.number, credit };
}

export async function getSale(tx: DbOrTx, id: string, lock = false): Promise<Sale> {
  const q = tx.select().from(sales).where(eq(sales.id, id));
  const [s] = lock ? await q.for("update") : await q;
  if (!s) throw new Rejection("La venta no existe");
  return s;
}

/** El turno donde vuelve la plata: el indicado, el de la venta si sigue abierto o el abierto de la caja. */
async function refundShift(tx: DbOrTx, sale: Sale, shiftId?: string | null): Promise<string> {
  if (shiftId) return (await getShift(tx, shiftId)).id;
  if (sale.shiftId) {
    const s = await getShift(tx, sale.shiftId);
    if (s.status === "open") return s.id;
  }
  const open = await openShiftOf(tx, sale.registerId);
  if (!open) throw new Rejection("Abrí la caja para devolver la plata");
  return open.id;
}

/** Anular una venta completa: pide motivo y PIN; queda visible como Anulada, nunca se borra. */
export async function voidSale(tx: DbOrTx, ctx: OpContext, p: OpPayload<"sale.void">) {
  need(ctx, "void_sale", "Anular venta");
  const sale = await getSale(tx, p.saleId, true);
  if (sale.status === "voided") throw new Rejection("La venta ya estaba anulada");
  const [ret] = await tx
    .select({ id: saleReturns.id })
    .from(saleReturns)
    .where(eq(saleReturns.saleId, sale.id));
  if (ret) throw new Rejection("La venta tiene devoluciones: no se puede anular completa");

  await tx
    .update(sales)
    .set({
      status: "voided",
      voidedAt: ctx.at,
      voidedBy: ctx.memberId,
      voidReason: p.reason,
      authorizedBy: ctx.authorizedBy ?? sale.authorizedBy,
    })
    .where(eq(sales.id, sale.id));

  const lines = await tx.select().from(saleLines).where(eq(saleLines.saleId, sale.id));
  for (const l of lines) {
    if (!l.productId || (l.kind !== "product" && l.kind !== "container")) continue;
    await applyStock(tx, {
      productId: l.productId,
      qty: l.qty,
      kind: "void",
      reason: p.reason,
      refType: "sale",
      refId: sale.id,
      memberId: ctx.memberId,
      deviceId: ctx.deviceId,
      deviceAt: ctx.at,
    });
  }

  const shiftId = await refundShift(tx, sale, p.shiftId);
  const moves = await tx
    .select()
    .from(cashMovements)
    .where(
      and(
        eq(cashMovements.refType, "sale"),
        eq(cashMovements.refId, sale.id),
        eq(cashMovements.kind, "sale"),
      ),
    );
  for (const m of moves) {
    await addCash(tx, {
      shiftId,
      kind: "void",
      method: m.method,
      amountCents: -m.amountCents,
      reason: p.reason,
      refType: "sale",
      refId: sale.id,
      memberId: ctx.memberId,
      authorizedBy: ctx.authorizedBy,
      deviceId: ctx.deviceId,
      at: ctx.at,
    });
  }

  const fiado = (await tx.select().from(salePayments).where(eq(salePayments.saleId, sale.id)))
    .filter((x) => x.method === "account")
    .reduce((a, x) => a + x.amountCents, 0);
  if (fiado > 0 && sale.customerId) {
    await creditDown(tx, ctx, {
      customerId: sale.customerId,
      amountCents: fiado,
      kind: "reversal",
      saleId: sale.id,
      note: `Anulación de la venta ${String(sale.number).padStart(6, "0")}`,
    });
  }

  const [who] = await tx
    .select({ name: members.name })
    .from(members)
    .where(eq(members.id, ctx.memberId));
  await raiseAlert(tx, {
    kind: "sale_voided",
    title: `Venta ${String(sale.number).padStart(6, "0")} anulada · ${formatMoney(sale.totalCents)}`,
    body: `${who?.name ?? ""}: ${p.reason}`,
    refType: "sale",
    refId: sale.id,
    dedupeKey: `sale_voided:${sale.id}`,
  });
  return { saleId: sale.id };
}

/**
 * Devolución desde un ticket: lo devuelto vuelve a la góndola o va a merma, y la plata
 * se devuelve en efectivo, por el mismo medio o como saldo a favor del cliente.
 */
export async function returnSale(tx: DbOrTx, ctx: OpContext, p: OpPayload<"sale.return">) {
  need(ctx, "void_sale", "Hacer una devolución");
  const sale = await getSale(tx, p.saleId, true);
  if (sale.status === "voided") throw new Rejection("La venta está anulada");
  const lines = await tx.select().from(saleLines).where(eq(saleLines.saleId, sale.id));
  const byId = new Map(lines.map((l) => [l.id, l]));
  let total = 0;
  for (const r of p.lines) {
    const l = byId.get(r.saleLineId);
    if (!l) throw new Rejection("Un ítem devuelto no es de esta venta");
    if (roundQty(l.returnedQty + r.qty) > l.qty)
      throw new Rejection(`${l.description}: se devuelve más de lo que se vendió`);
    total += r.totalCents;
  }
  if (total !== p.totalCents)
    throw new Rejection("El total de la devolución no coincide con los ítems");

  await tx.insert(saleReturns).values({
    id: p.id,
    saleId: sale.id,
    reason: p.reason,
    refundMethod: p.refundMethod,
    totalCents: p.totalCents,
    memberId: ctx.memberId,
    authorizedBy: ctx.authorizedBy,
    deviceId: ctx.deviceId,
    deviceAt: ctx.at,
    createdAt: ctx.at,
  });
  const REASON: Record<typeof p.reason, string> = {
    expired: "vencido",
    faulty: "fallado",
    exchange: "cambio",
    billing_error: "error de cobro",
    other: "otro",
  };
  for (const r of p.lines) {
    const l = byId.get(r.saleLineId);
    if (!l) continue;
    await tx.insert(saleReturnLines).values({
      id: r.id,
      returnId: p.id,
      saleLineId: l.id,
      qty: r.qty,
      totalCents: r.totalCents,
      destination: r.destination,
    });
    await tx
      .update(saleLines)
      .set({ returnedQty: roundQty(l.returnedQty + r.qty) })
      .where(eq(saleLines.id, l.id));
    if (!l.productId || l.kind !== "product") continue;
    const common = {
      productId: l.productId,
      refType: "sale_return",
      refId: p.id,
      memberId: ctx.memberId,
      deviceId: ctx.deviceId,
      deviceAt: ctx.at,
    };
    await applyStock(tx, {
      ...common,
      qty: r.qty,
      kind: "return",
      reason: `Devolución: ${REASON[p.reason]}`,
    });
    if (r.destination === "waste") {
      await applyStock(tx, {
        ...common,
        qty: -r.qty,
        kind: "waste",
        reason: `Merma por devolución: ${REASON[p.reason]}`,
      });
    }
  }

  if (p.refundMethod === "credit") {
    if (!sale.customerId) throw new Rejection("Elegí un cliente para dejarle saldo a favor");
    await creditDown(tx, ctx, {
      customerId: sale.customerId,
      amountCents: p.totalCents,
      kind: "refund",
      saleId: sale.id,
      note: `Devolución de la venta ${String(sale.number).padStart(6, "0")}`,
    });
  } else if (p.totalCents > 0) {
    const pays = await tx.select().from(salePayments).where(eq(salePayments.saleId, sale.id));
    const method =
      p.refundMethod === "cash"
        ? "cash"
        : (pays.find((x) => x.method !== "cash")?.method ?? "cash");
    if (method === "account") {
      if (!sale.customerId) throw new Rejection("La venta fiada no tiene cliente");
      await creditDown(tx, ctx, {
        customerId: sale.customerId,
        amountCents: p.totalCents,
        kind: "refund",
        saleId: sale.id,
      });
    } else {
      const shiftId = await refundShift(tx, sale, p.shiftId);
      await addCash(tx, {
        shiftId,
        kind: "refund",
        method,
        amountCents: -p.totalCents,
        reason: `Devolución: ${REASON[p.reason]}`,
        refType: "sale_return",
        refId: p.id,
        memberId: ctx.memberId,
        authorizedBy: ctx.authorizedBy,
        deviceId: ctx.deviceId,
        at: ctx.at,
      });
    }
  }
  const [c] = sale.customerId
    ? await tx
        .select({ balance: customers.balanceCents })
        .from(customers)
        .where(eq(customers.id, sale.customerId))
    : [];
  return { returnId: p.id, customerBalanceCents: c?.balance ?? null };
}
