import { newId, roundQty } from "@mostrador/shared";
import { eq } from "drizzle-orm";
import { products, type StockMovementKind, stockMovements } from "../db/schema/index";
import { raiseAlert } from "./alerts";
import { type DbOrTx, Rejection } from "./types";

export type StockChange = {
  productId: string;
  /** Con signo: + entra, − sale. En la unidad de venta del producto. */
  qty: number;
  kind: StockMovementKind;
  reason?: string | null;
  note?: string | null;
  refType?: string | null;
  refId?: string | null;
  lotId?: string | null;
  memberId?: string | null;
  deviceId?: string | null;
  deviceAt?: Date | null;
  status?: "applied" | "pending";
  id?: string;
};

export type StockResult = { movementId: string; productId: string; resultingQty: number | null };

/**
 * Agrega un movimiento al libro de stock y actualiza el total en la misma transacción.
 * Las presentaciones vinculadas (maple × 30) mueven el stock de su producto base.
 * Los servicios no llevan stock. El stock puede quedar negativo: se avisa, no se bloquea.
 */
export async function applyStock(tx: DbOrTx, ch: StockChange): Promise<StockResult | null> {
  const [p] = await tx.select().from(products).where(eq(products.id, ch.productId)).for("update");
  if (!p) throw new Rejection("El producto no existe");
  if (p.kind === "service") return null;

  let target = p;
  let q = ch.qty;
  if (p.stockBaseId) {
    const [base] = await tx
      .select()
      .from(products)
      .where(eq(products.id, p.stockBaseId))
      .for("update");
    if (!base) throw new Rejection("El producto base de la presentación no existe");
    target = base;
    q = roundQty(ch.qty * (p.stockBaseFactor ?? 1));
  }

  const id = ch.id ?? newId();
  const pending = ch.status === "pending";
  const resulting = pending ? null : roundQty(target.stockQty + q);
  await tx.insert(stockMovements).values({
    id,
    productId: target.id,
    kind: ch.kind,
    qty: q,
    resultingQty: resulting,
    reason: ch.reason ?? null,
    note: ch.note ?? null,
    status: pending ? "pending" : "applied",
    lotId: ch.lotId ?? null,
    refType: ch.refType ?? null,
    refId: ch.refId ?? null,
    memberId: ch.memberId ?? null,
    deviceId: ch.deviceId ?? null,
    deviceAt: ch.deviceAt ?? null,
  });
  if (resulting !== null) {
    await tx
      .update(products)
      .set({ stockQty: resulting, updatedAt: new Date() })
      .where(eq(products.id, target.id));
    if (resulting < 0) {
      await raiseAlert(tx, {
        kind: "negative_stock",
        severity: "danger",
        title: `${target.name}: stock negativo (${resulting})`,
        body: "Se vendió más de lo que había según el sistema. Revisá el stock.",
        refType: "product",
        refId: target.id,
        dedupeKey: `negative_stock:${target.id}`,
      });
    }
  }
  return { movementId: id, productId: target.id, resultingQty: resulting };
}
