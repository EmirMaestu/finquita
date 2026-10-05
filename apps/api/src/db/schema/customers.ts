import { boolean, date, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, money, ts, updatedAt } from "./common";

export type CreditTerms = "weekly" | "biweekly" | "30d" | "month_end";

export const customers = pgTable(
  "customers",
  {
    id: id(),
    name: text().notNull(),
    nickname: text(),
    phone: text(),
    address: text(),
    dni: text(),
    creditLimitCents: money("credit_limit_cents").notNull().default(0),
    terms: text().$type<CreditTerms>().notNull().default("30d"),
    termsDays: integer().notNull().default(30),
    /** Saldo: suma de customer_ledger (+ debe, − a favor). */
    balanceCents: money("balance_cents").notNull().default(0),
    notes: text(),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("customers_name_idx").on(t.name)],
);

export type LedgerKind = "sale" | "payment" | "refund" | "adjustment" | "reversal";

/** Cuenta corriente: libro que solo crece. Un movimiento se anula con un contramovimiento. */
export const customerLedger = pgTable(
  "customer_ledger",
  {
    id: id(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id),
    kind: text().$type<LedgerKind>().notNull(),
    /** + aumenta la deuda (fiado), − la baja (pago, devolución). */
    amountCents: money("amount_cents").notNull(),
    dueOn: date({ mode: "string" }),
    saleId: uuid(),
    reversesId: uuid(),
    method: text(),
    note: text(),
    memberId: uuid(),
    authorizedBy: uuid(),
    deviceId: uuid(),
    deviceAt: ts("device_at"),
    createdAt: createdAt(),
  },
  (t) => [index("customer_ledger_customer_idx").on(t.customerId, t.createdAt)],
);

/** A qué deuda se aplicó cada pago (las más viejas primero o tickets elegidos). */
export const ledgerAllocations = pgTable(
  "ledger_allocations",
  {
    id: id(),
    paymentId: uuid()
      .notNull()
      .references(() => customerLedger.id),
    chargeId: uuid()
      .notNull()
      .references(() => customerLedger.id),
    amountCents: money("amount_cents").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ledger_allocations_charge_idx").on(t.chargeId)],
);
