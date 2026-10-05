/** Cuentas a pagar a proveedores: estado de cada factura, vencimientos y saldo. */
import { addDays, type DateStr } from "./dates";

export type PayableKind = "invoice" | "delivery_note" | "credit_note";
export type PayableState = "pending" | "overdue" | "partial" | "paid";

export type Payable = {
  supplierId: string;
  kind: PayableKind;
  dueOn: DateStr | null;
  /** Nota de crédito: negativo. */
  amountCents: number;
  paidCents: number;
};

export const PAYABLE_STATE: Record<
  PayableState,
  { label: string; tone: "neutro" | "alerta" | "peligro" | "ok" | "info" }
> = {
  pending: { label: "Pendiente", tone: "info" },
  overdue: { label: "Vencida", tone: "peligro" },
  partial: { label: "Pagada parcial", tone: "alerta" },
  paid: { label: "Pagada", tone: "ok" },
};

export const PAYABLE_KIND: Record<PayableKind, string> = {
  invoice: "Factura",
  delivery_note: "Remito",
  credit_note: "Nota de crédito",
};

/** Lo que falta pagar (en una nota de crédito, lo que queda a favor, negativo). */
export const pendingOf = (p: Payable) => p.amountCents - p.paidCents;

/** Pendiente, vencida (pasó el vencimiento con saldo), pagada parcial o pagada. */
export function payableState(p: Payable, today: DateStr): PayableState {
  const pending = pendingOf(p);
  if (p.kind === "credit_note") return pending === 0 ? "paid" : "pending";
  if (pending <= 0) return "paid";
  if (p.dueOn && p.dueOn < today) return "overdue";
  return p.paidCents > 0 ? "partial" : "pending";
}

export type PayablesSummary = {
  /** Vence de hoy a 7 días (sin lo vencido). */
  dueThisWeekCents: number;
  overdueCents: number;
  /** Notas de crédito a favor (positivo). */
  creditNotesCents: number;
  /** Saldo total a pagar, con las notas de crédito restadas. */
  totalCents: number;
  bySupplier: Record<string, number>;
};

export function payablesSummary(list: Payable[], today: DateStr): PayablesSummary {
  const week = addDays(today, 7);
  const s: PayablesSummary = {
    dueThisWeekCents: 0,
    overdueCents: 0,
    creditNotesCents: 0,
    totalCents: 0,
    bySupplier: {},
  };
  for (const p of list) {
    const pending = pendingOf(p);
    if (!pending) continue;
    s.totalCents += pending;
    s.bySupplier[p.supplierId] = (s.bySupplier[p.supplierId] ?? 0) + pending;
    if (p.kind === "credit_note") {
      s.creditNotesCents += -pending;
      continue;
    }
    const st = payableState(p, today);
    if (st === "overdue") s.overdueCents += pending;
    else if (p.dueOn && p.dueOn <= week) s.dueThisWeekCents += pending;
  }
  return s;
}

/** Cómo vienen los costos en la lista del proveedor. */
export type PriceListTerms = { vatIncluded: boolean; vatBp: number; discountBp: number };

/**
 * Costo para el almacén: lo que se paga, con IVA y con la bonificación aplicada.
 * $ 10.000 sin IVA con 10 % de bonificación → $ 10.890.
 */
export function listCost(rawCents: number, t: PriceListTerms): number {
  const afterDiscount = (rawCents * (10000 - t.discountBp)) / 10000;
  const withVat = t.vatIncluded ? afterDiscount : (afterDiscount * (10000 + t.vatBp)) / 10000;
  return Math.round(withVat);
}
