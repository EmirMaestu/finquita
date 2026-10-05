import { newId, roundQty } from "@mostrador/shared";
import { syncClient, syncEngine } from "../sync";
import { bumpLocalVersion } from "../sync/status";
import { localDb } from "./db";

export type ReceiveLine = {
  productId: string;
  orderLineId?: string | null;
  qty: number;
  damagedQty: number;
  unitCostCents?: number | null;
  newPriceCents?: number | null;
  lotCode?: string | null;
  expiresOn?: string | null;
};

/**
 * Confirma una recepción: viaja por la cola (sirve sin conexión) y suma el stock local
 * enseguida (sin los dañados).
 */
export async function confirmReceiptLocal(r: {
  memberId: string;
  kind: "order" | "no_order" | "wholesale";
  orderId?: string | null;
  supplierId?: string | null;
  photoId?: string | null;
  invoiceNumber?: string | null;
  notes?: string | null;
  lines: ReceiveLine[];
}): Promise<string> {
  const db = localDb();
  const id = newId();
  const deltas = [];
  for (const l of r.lines) {
    const good = roundQty(l.qty - l.damagedQty);
    const p = await db.products.get(l.productId);
    if (!p || !good) continue;
    deltas.push({
      kind: "stock" as const,
      key: p.stockBaseId ?? p.id,
      amount: roundQty(good * (p.stockBaseId ? (p.stockBaseFactor ?? 1) : 1)),
    });
  }
  await syncClient().enqueue(
    {
      opId: newId(),
      type: "receipt.confirm",
      memberId: r.memberId,
      deviceAt: new Date().toISOString(),
      payload: {
        id,
        kind: r.kind,
        orderId: r.orderId ?? null,
        supplierId: r.supplierId ?? null,
        photoId: r.photoId ?? null,
        invoiceNumber: r.invoiceNumber ?? null,
        notes: r.notes ?? null,
        lines: r.lines.map((l) => ({ id: newId(), ...l, orderLineId: l.orderLineId ?? null })),
      },
    },
    deltas,
  );
  bumpLocalVersion();
  void syncEngine().kick();
  return id;
}
