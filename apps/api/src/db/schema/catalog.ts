import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, money, qty, ts, updatedAt } from "./common";

/** Categorías en dos niveles, con ganancia por defecto. */
export const categories = pgTable("categories", {
  id: id(),
  parentId: uuid().references((): AnyPgColumn => categories.id),
  name: text().notNull(),
  /** Ganancia sobre costo por defecto, en puntos básicos (4200 = 42 %). */
  defaultMarginBp: integer(),
  ageRestricted: boolean().notNull().default(false),
  tracksExpiry: boolean().notNull().default(false),
  sort: integer().notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: ts("deleted_at"),
});

export type SaleUnit = "unit" | "kg" | "100g";

export const products = pgTable(
  "products",
  {
    id: id(),
    name: text().notNull(),
    categoryId: uuid().references(() => categories.id),
    kind: text().$type<"product" | "service">().notNull().default("product"),
    /** Código interno o PLU (pesables y botones rápidos). */
    internalCode: text(),
    saleUnit: text().$type<SaleUnit>().notNull().default("unit"),
    purchaseUnitName: text(),
    purchaseUnitQty: qty("purchase_unit_qty"),
    /** Presentación vinculada: comparte el stock de otro producto (maple × 30 → huevo suelto). */
    stockBaseId: uuid().references((): AnyPgColumn => products.id),
    stockBaseFactor: qty("stock_base_factor"),
    costCents: money("cost_cents"),
    avgCostCents: money("avg_cost_cents"),
    marginBp: integer(),
    priceCents: money("price_cents").notNull().default(0),
    fixedPrice: boolean().notNull().default(false),
    /** IVA en puntos básicos (2100 = 21 %), para la fase 2. */
    vatBp: integer().notNull().default(2100),
    /** Stock total: suma de stock_movements, actualizada en la misma transacción. */
    stockQty: qty("stock_qty").notNull().default(0),
    minStock: qty("min_stock"),
    containerProductId: uuid().references((): AnyPgColumn => products.id),
    location: text(),
    tracksExpiry: boolean().notNull().default(false),
    ageRestricted: boolean().notNull().default(false),
    /** Servicios (recargas): comisión en puntos básicos. */
    commissionBp: integer(),
    photoUrl: text(),
    quickButton: boolean().notNull().default(false),
    /** "Completar ficha": alta rápida sin costo ni proveedor. */
    needsReview: boolean().notNull().default(false),
    /** "Revisar precio": cambió el costo en una recepción. */
    priceReview: boolean().notNull().default(false),
    priceUpdatedAt: ts("price_updated_at"),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    uniqueIndex("products_internal_code_uq").on(t.internalCode).where(sql`${t.deletedAt} is null`),
    index("products_category_idx").on(t.categoryId),
    index("products_name_idx").on(t.name),
    check("products_price_nonneg", sql`${t.priceCents} >= 0`),
  ],
);

/** Varios códigos de barras por producto. Un código pertenece a un solo producto. */
export const barcodes = pgTable(
  "barcodes",
  {
    id: id(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    code: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("barcodes_code_uq").on(t.code),
    index("barcodes_product_idx").on(t.productId),
  ],
);

/** Lotes con vencimiento. */
export const lots = pgTable(
  "lots",
  {
    id: id(),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    code: text(),
    expiresOn: date({ mode: "string" }).notNull(),
    qtyRemaining: qty("qty_remaining").notNull().default(0),
    receiptId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("lots_expires_idx").on(t.expiresOn)],
);

export type StockMovementKind =
  | "sale"
  | "return"
  | "receipt"
  | "adjustment"
  | "waste"
  | "count"
  | "void";

/** Libro de stock: solo crece. La cantidad lleva signo. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    kind: text().$type<StockMovementKind>().notNull(),
    qty: qty("qty").notNull(),
    /** Stock resultante después del movimiento (solo los aplicados). */
    resultingQty: qty("resulting_qty"),
    reason: text(),
    note: text(),
    photoUrl: text(),
    status: text().$type<"applied" | "pending" | "rejected">().notNull().default("applied"),
    lotId: uuid().references(() => lots.id),
    refType: text(),
    refId: uuid(),
    memberId: uuid(),
    deviceId: uuid(),
    approvedBy: uuid(),
    approvedAt: ts("approved_at"),
    deviceAt: ts("device_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("stock_movements_product_idx").on(t.productId, t.createdAt),
    index("stock_movements_ref_idx").on(t.refType, t.refId),
  ],
);

export type PromotionKind =
  | "two_for_one"
  | "three_for_two"
  | "nth_unit"
  | "category_percent"
  | "combo"
  | "weekday";

export const promotions = pgTable("promotions", {
  id: id(),
  name: text().notNull(),
  kind: text().$type<PromotionKind>().notNull(),
  /** Parámetros según el tipo: { n, percentBp, comboPriceCents, ... } */
  params: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  categoryId: uuid().references(() => categories.id),
  startsOn: date({ mode: "string" }),
  endsOn: date({ mode: "string" }),
  /** Días de la semana (0 = domingo). */
  weekdays: jsonb().$type<number[]>(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: ts("deleted_at"),
});

export const promotionProducts = pgTable(
  "promotion_products",
  {
    promotionId: uuid()
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    qty: qty("qty").notNull().default(1),
  },
  (t) => [uniqueIndex("promotion_products_pk").on(t.promotionId, t.productId)],
);
