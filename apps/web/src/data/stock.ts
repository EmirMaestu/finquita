import { newId, roundQty } from "@mostrador/shared";
import { syncClient, syncEngine } from "../sync";
import { bumpLocalVersion } from "../sync/status";
import { localDb } from "./db";

export type AdjustReason =
  | "waste"
  | "breakage"
  | "expired"
  | "missing"
  | "internal_use"
  | "load_error"
  | "other";

export const ADJUST_REASONS: Record<AdjustReason, string> = {
  waste: "Merma",
  breakage: "Rotura",
  expired: "Vencido",
  missing: "Faltante",
  internal_use: "Consumo interno",
  load_error: "Error de carga",
  other: "Otro",
};

/**
 * Ajuste de stock: viaja por la cola (sirve sin conexión). Si queda para aprobar,
 * no se toca el stock local hasta que lo aprueben.
 */
export async function adjustStockLocal(a: {
  memberId: string;
  productId: string;
  qty?: number;
  realQty?: number;
  reason: AdjustReason;
  note?: string | null;
  needsApproval: boolean;
  currentStock: number;
}) {
  const db = localDb();
  const p = await db.products.get(a.productId);
  const delta = a.qty ?? roundQty((a.realQty ?? 0) - a.currentStock);
  const deltas =
    a.needsApproval || !p || !delta
      ? []
      : [
          {
            kind: "stock" as const,
            key: p.stockBaseId ?? p.id,
            amount: roundQty(delta * (p.stockBaseId ? (p.stockBaseFactor ?? 1) : 1)),
          },
        ];
  await syncClient().enqueue(
    {
      opId: newId(),
      type: "stock.adjust",
      memberId: a.memberId,
      deviceAt: new Date().toISOString(),
      payload: {
        id: newId(),
        productId: a.productId,
        ...(a.qty !== undefined ? { qty: a.qty } : { realQty: a.realQty }),
        reason: a.reason,
        note: a.note ?? null,
      },
    },
    deltas,
  );
  bumpLocalVersion();
  void syncEngine().kick();
  return delta;
}
