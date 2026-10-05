import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id, money, ts, updatedAt } from "./common";

/** Gastos fijos que se pagan por fuera de la caja (alquiler, servicios, sueldos): mensuales. */
export const fixedExpenses = pgTable("fixed_expenses", {
  id: id(),
  name: text().notNull(),
  category: text()
    .$type<"rent" | "utilities" | "salaries" | "taxes" | "other">()
    .notNull()
    .default("other"),
  monthlyCents: money("monthly_cents").notNull(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: ts("deleted_at"),
});
