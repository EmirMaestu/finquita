import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { members, registers } from "./business";
import { createdAt, id, money, ts, updatedAt } from "./common";

export type Denominations = Record<string, number>;

/** Turno de caja: de la apertura al cierre de una persona. */
export const shifts = pgTable(
  "shifts",
  {
    id: id(),
    registerId: uuid()
      .notNull()
      .references(() => registers.id),
    memberId: uuid()
      .notNull()
      .references(() => members.id),
    status: text().$type<"open" | "closed">().notNull().default("open"),
    openedAt: ts("opened_at").notNull(),
    openingFloatCents: money("opening_float_cents").notNull(),
    openingCounts: jsonb().$type<Denominations>(),
    /** Lo que dejó el turno anterior, para comparar. */
    previousLeftCents: money("previous_left_cents"),
    openingNote: text(),
    closedAt: ts("closed_at"),
    closedBy: uuid().references(() => members.id),
    expectedCashCents: money("expected_cash_cents"),
    countedCashCents: money("counted_cash_cents"),
    closingCounts: jsonb().$type<Denominations>(),
    /** Otros medios contados contra lo registrado: { debit: { counted, expected }, ... } */
    otherMedia: jsonb().$type<Record<string, { counted: number; expected: number }>>(),
    differenceCents: money("difference_cents"),
    closeNote: text(),
    leftFloatCents: money("left_float_cents"),
    withdrawnCents: money("withdrawn_cents"),
    /** Diferencia entre el cierre local y el recalculado en el servidor. */
    serverMismatchCents: money("server_mismatch_cents"),
    deviceId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("shifts_register_idx").on(t.registerId, t.openedAt)],
);

export type PaymentMethod = "cash" | "debit" | "credit" | "transfer" | "qr" | "account";

export type CashMovementKind =
  | "sale"
  | "refund"
  | "void"
  | "withdrawal"
  | "expense"
  | "income"
  | "credit_payment"
  | "supplier_payment";

/** Libro de caja: solo crece. Monto con signo (+ entra, − sale). */
export const cashMovements = pgTable(
  "cash_movements",
  {
    id: id(),
    shiftId: uuid()
      .notNull()
      .references(() => shifts.id),
    kind: text().$type<CashMovementKind>().notNull(),
    method: text().$type<PaymentMethod>().notNull().default("cash"),
    amountCents: money("amount_cents").notNull(),
    reason: text(),
    category: text(),
    note: text(),
    photoUrl: text(),
    refType: text(),
    refId: uuid(),
    memberId: uuid(),
    authorizedBy: uuid(),
    deviceId: uuid(),
    deviceAt: ts("device_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("cash_movements_shift_idx").on(t.shiftId, t.createdAt),
    index("cash_movements_ref_idx").on(t.refType, t.refId),
  ],
);
