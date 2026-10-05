import { boolean, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { members, registers } from "./business";
import { type PaymentMethod, shifts } from "./cash";
import { categories, products } from "./catalog";
import { createdAt, id, money, qty, ts } from "./common";
import { customers } from "./customers";

export const sales = pgTable(
  "sales",
  {
    id: id(),
    registerId: uuid()
      .notNull()
      .references(() => registers.id),
    shiftId: uuid().references(() => shifts.id),
    /** Numeración por puesto de cobro: Caja 1 · Venta 004187. */
    number: integer().notNull(),
    memberId: uuid()
      .notNull()
      .references(() => members.id),
    customerId: uuid().references(() => customers.id),
    status: text().$type<"completed" | "voided">().notNull().default("completed"),
    subtotalCents: money("subtotal_cents").notNull(),
    discountCents: money("discount_cents").notNull().default(0),
    surchargeCents: money("surcharge_cents").notNull().default(0),
    totalCents: money("total_cents").notNull(),
    changeCents: money("change_cents").notNull().default(0),
    receiptType: text().$type<"ticket" | "invoice">().notNull().default("ticket"),
    note: text(),
    deviceId: uuid(),
    deviceAt: ts("device_at").notNull(),
    /** La hora del dispositivo difiere en más de 5 minutos de la del servidor. */
    clockSkew: boolean().notNull().default(false),
    voidedAt: ts("voided_at"),
    voidedBy: uuid(),
    voidReason: text(),
    authorizedBy: uuid(),
    createdAt: createdAt(),
  },
  (t) => [
    index("sales_register_number_idx").on(t.registerId, t.number),
    index("sales_device_at_idx").on(t.deviceAt),
    index("sales_shift_idx").on(t.shiftId),
  ],
);

export type SaleLineKind = "product" | "misc" | "promo" | "container" | "discount";

/** Cada línea guarda precio y descripción con que se vendió. */
export const saleLines = pgTable(
  "sale_lines",
  {
    id: id(),
    saleId: uuid()
      .notNull()
      .references(() => sales.id),
    position: integer().notNull(),
    kind: text().$type<SaleLineKind>().notNull().default("product"),
    productId: uuid().references(() => products.id),
    categoryId: uuid().references(() => categories.id),
    description: text().notNull(),
    qty: qty("qty").notNull(),
    unit: text().$type<"unit" | "kg">().notNull().default("unit"),
    unitPriceCents: money("unit_price_cents").notNull(),
    discountCents: money("discount_cents").notNull().default(0),
    totalCents: money("total_cents").notNull(),
    /** Costo al momento de vender, para el margen. */
    unitCostCents: money("unit_cost_cents"),
    promotionId: uuid(),
    note: text(),
    /** Cantidad ya devuelta. */
    returnedQty: qty("returned_qty").notNull().default(0),
  },
  (t) => [
    index("sale_lines_sale_idx").on(t.saleId),
    index("sale_lines_product_idx").on(t.productId),
  ],
);

export const salePayments = pgTable(
  "sale_payments",
  {
    id: id(),
    saleId: uuid()
      .notNull()
      .references(() => sales.id),
    method: text().$type<PaymentMethod>().notNull(),
    amountCents: money("amount_cents").notNull(),
    /** Efectivo recibido (para el vuelto). */
    tenderedCents: money("tendered_cents"),
    surchargeCents: money("surcharge_cents").notNull().default(0),
    /** Transferencia o QR: "Verificada en el banco". */
    verified: boolean().notNull().default(false),
    customerId: uuid().references(() => customers.id),
  },
  (t) => [index("sale_payments_sale_idx").on(t.saleId)],
);

/** Devoluciones desde un ticket. */
export const saleReturns = pgTable("sale_returns", {
  id: id(),
  saleId: uuid()
    .notNull()
    .references(() => sales.id),
  reason: text().notNull(),
  refundMethod: text().$type<"cash" | "same" | "credit">().notNull(),
  totalCents: money("total_cents").notNull(),
  memberId: uuid(),
  authorizedBy: uuid(),
  deviceId: uuid(),
  deviceAt: ts("device_at"),
  createdAt: createdAt(),
});

export const saleReturnLines = pgTable("sale_return_lines", {
  id: id(),
  returnId: uuid()
    .notNull()
    .references(() => saleReturns.id),
  saleLineId: uuid()
    .notNull()
    .references(() => saleLines.id),
  qty: qty("qty").notNull(),
  totalCents: money("total_cents").notNull(),
  /** Vuelve a la góndola o va a merma. */
  destination: text().$type<"shelf" | "waste">().notNull(),
});
