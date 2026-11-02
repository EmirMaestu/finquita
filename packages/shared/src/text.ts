import type { OpType } from "./sync";

/** Cada operación con su artículo, para frases: "No se pudo registrar la venta". */
export const OP_LABEL_ES: Record<OpType, string> = {
  "sale.create": "la venta",
  "sale.void": "la anulación de la venta",
  "sale.return": "la devolución",
  "cash.shift_open": "la apertura de caja",
  "cash.movement": "el movimiento de caja",
  "cash.shift_close": "el cierre de caja",
  "stock.adjust": "el ajuste de stock",
  "product.upsert": "el producto",
  "customer.upsert": "el cliente",
  "credit.payment": "el cobro de fiado",
  "shortage.note": "el faltante",
  "receipt.confirm": "la recepción de mercadería",
};

/** "1 ítem", "3 ítems": el número con su palabra en singular o plural. */
export function plural(
  n: number,
  singular: string,
  pluralWord: string,
  formatted?: string,
): string {
  return `${formatted ?? n} ${n === 1 ? singular : pluralWord}`;
}
