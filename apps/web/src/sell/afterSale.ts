import { newId, type OpPayload, roundQty } from "@mostrador/shared";
import { localDb } from "../data/db";
import type { Delta } from "../data/types";
import { syncClient, syncEngine } from "../sync";
import { bumpLocalVersion } from "../sync/status";

type SaleRef = {
  id: string;
  number: number;
  lines: { id: string; productId: string | null; kind: string; qty: number }[];
  payments: { method: string; amountCents: number }[];
  customerId: string | null;
  changeCents: number;
};

async function stockDelta(
  productId: string,
  qty: number,
): Promise<Omit<Delta, "opId" | "id"> | null> {
  const p = await localDb().products.get(productId);
  if (!p || p.kind === "service") return null;
  return {
    kind: "stock",
    key: p.stockBaseId ?? p.id,
    amount: roundQty(qty * (p.stockBaseId ? (p.stockBaseFactor ?? 1) : 1)),
  };
}

/** Devolución desde el ticket: viaja por la cola; lo que vuelve a la góndola suma stock. */
export async function returnSaleLocal(a: {
  memberId: string;
  authorizedBy: string | null;
  sale: SaleRef;
  shiftId: string | null;
  reason: OpPayload<"sale.return">["reason"];
  refundMethod: OpPayload<"sale.return">["refundMethod"];
  lines: { saleLineId: string; qty: number; totalCents: number; destination: "shelf" | "waste" }[];
}) {
  const at = new Date().toISOString();
  const opId = newId();
  const total = a.lines.reduce((s, l) => s + l.totalCents, 0);
  const deltas: Omit<Delta, "opId" | "id">[] = [];
  for (const r of a.lines) {
    const l = a.sale.lines.find((x) => x.id === r.saleLineId);
    if (!l?.productId || r.destination !== "shelf") continue;
    const d = await stockDelta(l.productId, r.qty);
    if (d) deltas.push(d);
  }
  if (a.refundMethod === "credit" && a.sale.customerId)
    deltas.push({ kind: "balance", key: a.sale.customerId, amount: -total });
  if (a.refundMethod === "cash" && a.shiftId) {
    await localDb().cashMoves.put({
      id: newId(),
      shiftId: a.shiftId,
      kind: "refund",
      method: "cash",
      amountCents: -total,
      reason: `Devolución venta ${String(a.sale.number).padStart(6, "0")}`,
      memberId: a.memberId,
      at,
      opId,
      source: "local",
    });
  }
  await syncClient().enqueue(
    {
      opId,
      type: "sale.return",
      memberId: a.memberId,
      authorizedBy: a.authorizedBy,
      deviceAt: at,
      payload: {
        id: newId(),
        saleId: a.sale.id,
        reason: a.reason,
        refundMethod: a.refundMethod,
        shiftId: a.shiftId,
        lines: a.lines.map((l) => ({ id: newId(), ...l })),
        totalCents: total,
      },
    },
    deltas,
  );
  bumpLocalVersion();
  void syncEngine().kick();
}

/** Anular una venta completa: pide motivo y PIN; queda visible como Anulada. */
export async function voidSaleLocal(a: {
  memberId: string;
  authorizedBy: string | null;
  sale: SaleRef;
  shiftId: string | null;
  reason: string;
}) {
  const at = new Date().toISOString();
  const opId = newId();
  const deltas: Omit<Delta, "opId" | "id">[] = [];
  for (const l of a.sale.lines) {
    if (!l.productId || (l.kind !== "product" && l.kind !== "container")) continue;
    const d = await stockDelta(l.productId, l.qty);
    if (d) deltas.push(d);
  }
  const fiado = a.sale.payments
    .filter((p) => p.method === "account")
    .reduce((s, p) => s + p.amountCents, 0);
  if (fiado && a.sale.customerId)
    deltas.push({ kind: "balance", key: a.sale.customerId, amount: -fiado });
  const cash =
    a.sale.payments.filter((p) => p.method === "cash").reduce((s, p) => s + p.amountCents, 0) -
    a.sale.changeCents;
  if (cash > 0 && a.shiftId) {
    await localDb().cashMoves.put({
      id: newId(),
      shiftId: a.shiftId,
      kind: "void",
      method: "cash",
      amountCents: -cash,
      reason: `Anulación venta ${String(a.sale.number).padStart(6, "0")}`,
      memberId: a.memberId,
      at,
      opId,
      source: "local",
    });
  }
  const local = await localDb().sales.get(a.sale.id);
  if (local) await localDb().sales.put({ ...local, status: "voided" });
  await syncClient().enqueue(
    {
      opId,
      type: "sale.void",
      memberId: a.memberId,
      authorizedBy: a.authorizedBy,
      deviceAt: at,
      payload: { saleId: a.sale.id, reason: a.reason, shiftId: a.shiftId },
    },
    deltas,
  );
  bumpLocalVersion();
  void syncEngine().kick();
}
