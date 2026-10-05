/** Cobro: pago combinado, recargos por medio y vuelto. */
import { surchargeFor } from "./settings";
import type { PaymentMethodCode } from "./sync";

export type Tender = {
  method: PaymentMethodCode;
  /** Lo que se cobra con ese medio (incluye su recargo). */
  amountCents: number;
  /** Efectivo entregado por el cliente. */
  tenderedCents?: number | null;
  surchargeCents?: number;
  verified?: boolean;
};

export type CheckoutState = {
  surchargeCents: number;
  /** Total más recargos. */
  dueCents: number;
  paidCents: number;
  remainingCents: number;
  changeCents: number;
};

export function checkoutState(totalCents: number, tenders: Tender[]): CheckoutState {
  const surchargeCents = tenders.reduce((s, t) => s + (t.surchargeCents ?? 0), 0);
  const dueCents = totalCents + surchargeCents;
  const paidCents = tenders.reduce((s, t) => s + t.amountCents, 0);
  return {
    surchargeCents,
    dueCents,
    paidCents,
    remainingCents: Math.max(0, dueCents - paidCents),
    changeCents: Math.max(0, paidCents - dueCents),
  };
}

/**
 * Arma un pago contra lo que falta. En efectivo, lo tipeado es lo que entrega el cliente
 * (puede ser más: hay vuelto). Con otros medios se cobra hasta lo que falta, más su recargo.
 */
export function makeTender(a: {
  method: PaymentMethodCode;
  remainingCents: number;
  /** Monto tipeado; null = justo lo que falta. */
  typedCents: number | null;
  surchargeBp?: number;
  verified?: boolean;
}): Tender | null {
  const base = a.typedCents ?? a.remainingCents;
  if (base <= 0 || a.remainingCents <= 0) return null;
  if (a.method === "cash")
    return { method: "cash", amountCents: base, tenderedCents: base, surchargeCents: 0 };
  const amount = Math.min(base, a.remainingCents);
  const surcharge = surchargeFor(amount, a.surchargeBp ?? 0);
  return {
    method: a.method,
    amountCents: amount + surcharge,
    surchargeCents: surcharge,
    verified: a.verified ?? false,
  };
}

/** El efectivo solo puede pasarse (vuelto); con los demás medios, nunca. */
export function canComplete(totalCents: number, tenders: Tender[]): boolean {
  const s = checkoutState(totalCents, tenders);
  if (s.remainingCents > 0) return false;
  const cash = tenders.filter((t) => t.method === "cash").reduce((x, t) => x + t.amountCents, 0);
  return s.changeCents <= cash;
}

/** Fiado: por encima del límite o con deuda vencida pide PIN. */
export function creditNeedsPin(a: {
  balanceCents: number;
  limitCents: number;
  overdueCents: number;
  chargeCents: number;
}): boolean {
  return a.overdueCents > 0 || a.balanceCents + a.chargeCents > a.limitCents;
}
