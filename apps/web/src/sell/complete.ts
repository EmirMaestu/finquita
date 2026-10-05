import {
  type Cart,
  cartTotals,
  lineAmount,
  newId,
  type OpPayload,
  type PaymentMethodCode,
  roundQty,
} from "@mostrador/shared";
import { api } from "../data/api";
import { localDb } from "../data/db";
import type { Delta } from "../data/types";
import { syncClient, syncEngine } from "../sync";
import { bumpLocalVersion } from "../sync/status";

export type Payment = {
  method: PaymentMethodCode;
  amountCents: number;
  tenderedCents?: number | null;
  surchargeCents?: number;
  verified?: boolean;
};

/** Número de venta por puesto de cobro: nunca se repite entre dispositivos sin conexión. */
export async function nextSaleNumber(registerId: string): Promise<number> {
  const db = localDb();
  const key = `saleSeq:${registerId}`;
  let last = (await db.getMeta<number>(key)) ?? 0;
  if (!last) {
    try {
      const regs = await api<{ id: string; lastSaleNumber: number }[]>("/api/registers");
      last = regs.find((r) => r.id === registerId)?.lastSaleNumber ?? 0;
    } catch {}
  }
  const next = last + 1;
  await db.setMeta(key, next);
  return next;
}

export type LocalSale = {
  id: string;
  number: number;
  registerId: string;
  shiftId: string;
  memberId: string;
  memberName: string;
  customerId: string | null;
  lines: OpPayload<"sale.create">["lines"];
  payments: OpPayload<"sale.create">["payments"];
  subtotalCents: number;
  discountCents: number;
  surchargeCents: number;
  totalCents: number;
  changeCents: number;
  deviceAt: string;
  status: "completed" | "voided";
};

/**
 * Cierra la venta en el dispositivo: queda guardada al instante (stock, caja y fiado locales)
 * y sale por la cola. Funciona igual sin conexión.
 */
export async function completeSale(a: {
  member: { id: string; name: string };
  registerId: string;
  shiftId: string;
  cart: Cart;
  payments: Payment[];
  surchargeCents?: number;
  authorizedBy?: string | null;
}): Promise<LocalSale> {
  const db = localDb();
  const totals = cartTotals(a.cart);
  const surcharge = a.surchargeCents ?? 0;
  const total = totals.totalCents + surcharge;
  const paid = a.payments.reduce((s, p) => s + p.amountCents, 0);
  const change = Math.max(0, paid - total);
  const number = await nextSaleNumber(a.registerId);
  const at = new Date().toISOString();
  const id = newId();
  const lines = a.cart.lines.map((l) => ({
    id: l.id,
    kind: l.kind,
    productId: l.productId,
    categoryId: l.categoryId,
    description: l.description,
    qty: l.qty,
    unit: l.unit,
    unitPriceCents: l.unitPriceCents,
    discountCents: l.discountCents,
    totalCents: lineAmount(l),
    promotionId: l.promotionId ?? null,
    note: l.note ?? null,
  }));
  const payments = a.payments.map((p) => ({
    id: newId(),
    method: p.method,
    amountCents: p.amountCents,
    tenderedCents: p.tenderedCents ?? null,
    surchargeCents: p.surchargeCents ?? 0,
    verified: p.verified ?? false,
    customerId: p.method === "account" ? a.cart.customerId : null,
  }));
  const payload: OpPayload<"sale.create"> = {
    id,
    registerId: a.registerId,
    shiftId: a.shiftId,
    number,
    customerId: a.cart.customerId,
    lines,
    payments,
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    surchargeCents: surcharge,
    totalCents: total,
    changeCents: change,
    receiptType: "ticket",
  };

  // Efectos locales: stock (del producto base en las presentaciones), saldo del fiado y caja.
  const deltas: Omit<Delta, "opId" | "id">[] = [];
  for (const l of lines) {
    if (!l.productId || (l.kind !== "product" && l.kind !== "container")) continue;
    const p = await db.products.get(l.productId);
    if (!p || p.kind === "service") continue;
    deltas.push({
      kind: "stock",
      key: p.stockBaseId ?? p.id,
      amount: -roundQty(l.qty * (p.stockBaseId ? (p.stockBaseFactor ?? 1) : 1)),
    });
  }
  const fiado = payments
    .filter((p) => p.method === "account")
    .reduce((s, p) => s + p.amountCents, 0);
  if (fiado && a.cart.customerId)
    deltas.push({ kind: "balance", key: a.cart.customerId, amount: fiado });

  const opId = newId();
  let changeLeft = change;
  const moves = payments.flatMap((p) => {
    let amount = p.amountCents;
    if (p.method === "cash" && changeLeft) {
      const used = Math.min(changeLeft, amount);
      amount -= used;
      changeLeft -= used;
    }
    return amount
      ? [
          {
            id: newId(),
            shiftId: a.shiftId,
            kind: "sale" as const,
            method: p.method,
            amountCents: amount,
            reason: `Venta ${String(number).padStart(6, "0")}`,
            memberId: a.member.id,
            at,
            opId,
            source: "local" as const,
            refId: id,
          },
        ]
      : [];
  });

  const local: LocalSale = {
    ...payload,
    customerId: payload.customerId ?? null,
    shiftId: a.shiftId,
    memberId: a.member.id,
    memberName: a.member.name,
    deviceAt: at,
    status: "completed",
  };
  await db.transaction("rw", db.sales, db.cashMoves, async () => {
    await db.sales.put(local as unknown as { id: string });
    if (moves.length) await db.cashMoves.bulkPut(moves);
  });
  await syncClient().enqueue(
    {
      opId,
      type: "sale.create",
      memberId: a.member.id,
      authorizedBy: a.authorizedBy ?? null,
      deviceAt: at,
      payload,
    },
    deltas,
  );
  bumpLocalVersion();
  void syncEngine().kick();
  return local;
}
