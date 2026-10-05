import { bigint, numeric, timestamp, uuid } from "drizzle-orm/pg-core";

/** IDs UUIDv7 generados en el cliente (o en el servidor con newId()). */
export const id = () => uuid("id").primaryKey();

/** Plata en centavos. bigint en la base, number en JS. */
export const money = (name: string) => bigint(name, { mode: "number" });

/** Cantidades con tres decimales (pesables). */
export const qty = (name: string) => numeric(name, { precision: 12, scale: 3, mode: "number" });

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
export const ts = (name: string) => timestamp(name, { withTimezone: true });
