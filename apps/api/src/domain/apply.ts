import type { OpType, SyncOp } from "@mostrador/shared";
import { cashMovement, closeShift, openShift } from "./cash";
import { adjustStock, noteShortage, upsertCustomer, upsertProduct } from "./catalog";
import { creditPayment } from "./credit";
import { createSale, returnSale, voidSale } from "./sales";
import type { DbOrTx, OpContext } from "./types";

type Applier = (tx: DbOrTx, ctx: OpContext, payload: never) => Promise<unknown>;

const APPLIERS: Record<OpType, Applier> = {
  "sale.create": createSale as Applier,
  "sale.void": voidSale as Applier,
  "sale.return": returnSale as Applier,
  "cash.shift_open": openShift as Applier,
  "cash.movement": cashMovement as Applier,
  "cash.shift_close": closeShift as Applier,
  "stock.adjust": adjustStock as Applier,
  "product.upsert": upsertProduct as Applier,
  "customer.upsert": upsertCustomer as Applier,
  "credit.payment": creditPayment as Applier,
  "shortage.note": noteShortage as Applier,
};

export const OP_LABEL: Record<OpType, string> = {
  "sale.create": "venta",
  "sale.void": "anulación de venta",
  "sale.return": "devolución",
  "cash.shift_open": "apertura de caja",
  "cash.movement": "movimiento de caja",
  "cash.shift_close": "cierre de caja",
  "stock.adjust": "ajuste de stock",
  "product.upsert": "producto",
  "customer.upsert": "cliente",
  "credit.payment": "cobro de fiado",
  "shortage.note": "faltante",
};

/** Aplica una operación del protocolo con el servicio de dominio que le corresponde. */
export function applyOp(tx: DbOrTx, ctx: OpContext, op: SyncOp): Promise<unknown> {
  return APPLIERS[op.type](tx, ctx, op.payload as never);
}
