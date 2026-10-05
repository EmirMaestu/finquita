import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { members } from "./business";
import { categories, products } from "./catalog";
import { createdAt, id, qty, ts, updatedAt } from "./common";

/** Conteo de inventario: total, por categoría o por góndola, asignado a alguien. */
export const stockCounts = pgTable("stock_counts", {
  id: id(),
  name: text().notNull(),
  scope: text().$type<"all" | "category" | "location">().notNull().default("all"),
  categoryId: uuid().references(() => categories.id),
  location: text(),
  assignedTo: uuid().references(() => members.id),
  status: text().$type<"open" | "submitted" | "approved" | "cancelled">().notNull().default("open"),
  createdBy: uuid(),
  submittedAt: ts("submitted_at"),
  approvedAt: ts("approved_at"),
  approvedBy: uuid(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const stockCountLines = pgTable(
  "stock_count_lines",
  {
    id: id(),
    countId: uuid()
      .notNull()
      .references(() => stockCounts.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    /** Lo contado (null = todavía no se contó). */
    countedQty: qty("counted_qty"),
    countedBy: uuid(),
    countedAt: ts("counted_at"),
    /** Stock del sistema al aprobar (para la diferencia). */
    systemQty: qty("system_qty"),
    status: text().$type<"pending" | "approved" | "skipped">().notNull().default("pending"),
  },
  (t) => [
    uniqueIndex("stock_count_lines_uq").on(t.countId, t.productId),
    index("stock_count_lines_count_idx").on(t.countId),
  ],
);
