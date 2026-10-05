import { type DateStr, diffDays } from "./dates";
import type { Cents } from "./money";

export type LedgerEntry = {
  id: string;
  /** + aumenta la deuda (fiado), − la baja (pago, devolución). */
  amountCents: Cents;
  /** Fecha del movimiento. */
  date: DateStr;
  /** Vencimiento de una compra fiada. */
  dueOn?: DateStr | null;
};

export type OpenCharge = { id: string; date: DateStr; dueOn: DateStr | null; openCents: Cents };

/**
 * Aplica los pagos a las deudas más viejas primero y devuelve lo que queda abierto de cada compra.
 * Un saldo a favor (pagos de más) queda en `creditCents`.
 */
export function openCharges(entries: LedgerEntry[]): { open: OpenCharge[]; creditCents: Cents } {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const open: OpenCharge[] = [];
  let credit = 0;
  for (const e of sorted) {
    if (e.amountCents > 0) {
      let amount = e.amountCents;
      const used = Math.min(credit, amount);
      credit -= used;
      amount -= used;
      if (amount > 0)
        open.push({ id: e.id, date: e.date, dueOn: e.dueOn ?? null, openCents: amount });
    } else {
      let pay = -e.amountCents;
      for (const c of open) {
        if (pay === 0) break;
        const used = Math.min(pay, c.openCents);
        c.openCents -= used;
        pay -= used;
      }
      credit += pay;
    }
  }
  return { open: open.filter((c) => c.openCents > 0), creditCents: credit };
}

export type CreditSummary = {
  balanceCents: Cents;
  overdueCents: Cents;
  /** Días de la deuda más vieja todavía abierta (null si no debe nada). */
  oldestDebtDays: number | null;
};

export function creditSummary(entries: LedgerEntry[], asOf: DateStr): CreditSummary {
  const balanceCents = entries.reduce((s, e) => s + e.amountCents, 0);
  const { open } = openCharges(entries);
  const overdueCents = open
    .filter((c) => c.dueOn !== null && c.dueOn < asOf)
    .reduce((s, c) => s + c.openCents, 0);
  const oldest = open[0];
  return {
    balanceCents,
    overdueCents,
    oldestDebtDays: oldest ? diffDays(oldest.date, asOf) : null,
  };
}
