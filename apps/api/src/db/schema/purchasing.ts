import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { products } from "./catalog";
import { createdAt, id, money, qty, ts, updatedAt } from "./common";

export type SupplierChannel = "whatsapp" | "manual" | "wholesale";

export const suppliers = pgTable("suppliers", {
  id: id(),
  name: text().notNull(),
  legalName: text(),
  cuit: text(),
  category: text(),
  contactName: text(),
  whatsapp: text(),
  email: text(),
  channel: text().$type<SupplierChannel>().notNull().default("whatsapp"),
  /** Días de pedido y entrega (0 = domingo). */
  orderDays: jsonb().$type<number[]>(),
  deliveryDays: jsonb().$type<number[]>(),
  /** Texto libre cuando no es un día fijo ("Cada 15 días"). */
  scheduleNote: text(),
  leadDays: integer(),
  minOrderCents: money("min_order_cents"),
  paymentTermsDays: integer(),
  notes: text(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: ts("deleted_at"),
});

export const supplierProducts = pgTable(
  "supplier_products",
  {
    id: id(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    supplierCode: text(),
    costCents: money("cost_cents"),
    packQty: qty("pack_qty"),
    isPrimary: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("supplier_products_uq").on(t.supplierId, t.productId),
    index("supplier_products_product_idx").on(t.productId),
  ],
);

export type OrderStatus =
  | "draft"
  | "sent"
  | "confirmed"
  | "changed"
  | "partial"
  | "received"
  | "closed"
  | "cancelled";

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: id(),
    number: integer().notNull(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id),
    status: text().$type<OrderStatus>().notNull().default("draft"),
    expectedOn: date({ mode: "string" }),
    sentAt: ts("sent_at"),
    confirmedAt: ts("confirmed_at"),
    receivedAt: ts("received_at"),
    closedAt: ts("closed_at"),
    totalCents: money("total_cents").notNull().default(0),
    notes: text(),
    /** Línea de tiempo: [{ at, status, memberId, note }] */
    timeline: jsonb()
      .$type<{ at: string; status: string; memberId?: string; note?: string }[]>()
      .notNull()
      .default([]),
    createdBy: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("purchase_orders_number_uq").on(t.number)],
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    description: text().notNull(),
    qtyOrdered: qty("qty_ordered").notNull(),
    qtyConfirmed: qty("qty_confirmed"),
    qtyReceived: qty("qty_received"),
    packQty: qty("pack_qty"),
    unitCostCents: money("unit_cost_cents"),
    note: text(),
  },
  (t) => [index("purchase_order_lines_order_idx").on(t.orderId)],
);

/** Pedido fijo (reparto diario): lista que se repite. */
export const standingOrders = pgTable("standing_orders", {
  id: id(),
  supplierId: uuid()
    .notNull()
    .references(() => suppliers.id),
  name: text().notNull(),
  /** Días en que se repite (0 = domingo). */
  weekdays: jsonb().$type<number[]>().notNull().default([]),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const standingOrderLines = pgTable("standing_order_lines", {
  id: id(),
  standingOrderId: uuid()
    .notNull()
    .references(() => standingOrders.id, { onDelete: "cascade" }),
  productId: uuid()
    .notNull()
    .references(() => products.id),
  qty: qty("qty").notNull(),
});

/** Recepción de mercadería, con o sin pedido. */
export const receipts = pgTable("receipts", {
  id: id(),
  supplierId: uuid().references(() => suppliers.id),
  orderId: uuid().references(() => purchaseOrders.id),
  kind: text().$type<"order" | "no_order" | "wholesale">().notNull(),
  status: text().$type<"draft" | "confirmed">().notNull().default("draft"),
  photoUrl: text(),
  totalCents: money("total_cents").notNull().default(0),
  notes: text(),
  memberId: uuid(),
  deviceId: uuid(),
  receivedAt: ts("received_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const receiptLines = pgTable(
  "receipt_lines",
  {
    id: id(),
    receiptId: uuid()
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    orderLineId: uuid(),
    qty: qty("qty").notNull(),
    damagedQty: qty("damaged_qty").notNull().default(0),
    unitCostCents: money("unit_cost_cents"),
    previousCostCents: money("previous_cost_cents"),
    lotCode: text(),
    expiresOn: date({ mode: "string" }),
  },
  (t) => [index("receipt_lines_receipt_idx").on(t.receiptId)],
);

export type InvoiceStatus = "pending" | "partial" | "paid";

/** Facturas, remitos y notas de crédito de proveedores. */
export const supplierInvoices = pgTable(
  "supplier_invoices",
  {
    id: id(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id),
    receiptId: uuid().references(() => receipts.id),
    kind: text().$type<"invoice" | "delivery_note" | "credit_note">().notNull().default("invoice"),
    number: text(),
    issuedOn: date({ mode: "string" }).notNull(),
    dueOn: date({ mode: "string" }),
    /** Nota de crédito: monto negativo. */
    amountCents: money("amount_cents").notNull(),
    paidCents: money("paid_cents").notNull().default(0),
    status: text().$type<InvoiceStatus>().notNull().default("pending"),
    photoUrl: text(),
    notes: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("supplier_invoices_supplier_idx").on(t.supplierId, t.dueOn)],
);

export const supplierPayments = pgTable("supplier_payments", {
  id: id(),
  supplierId: uuid()
    .notNull()
    .references(() => suppliers.id),
  invoiceId: uuid().references(() => supplierInvoices.id),
  amountCents: money("amount_cents").notNull(),
  method: text().$type<"cash" | "transfer" | "other">().notNull(),
  cashMovementId: uuid(),
  photoUrl: text(),
  note: text(),
  memberId: uuid(),
  paidAt: ts("paid_at").notNull(),
  createdAt: createdAt(),
});

/** Faltantes anotados (cajero o repositor): entran al próximo pedido sugerido. */
export const shortages = pgTable("shortages", {
  id: id(),
  productId: uuid()
    .notNull()
    .references(() => products.id),
  note: text(),
  memberId: uuid(),
  resolvedAt: ts("resolved_at"),
  createdAt: createdAt(),
});
