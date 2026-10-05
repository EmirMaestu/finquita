import { type DateStr, diffDays, formatDate, formatTime } from "./dates";
import { type Cents, formatMoney } from "./money";

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

export const TERMS_LABEL: Record<"weekly" | "biweekly" | "30d" | "month_end", string> = {
  weekly: "Semanal",
  biweekly: "Quincenal",
  "30d": "30 días",
  month_end: "Fin de mes",
};

/** Recibo de un pago de fiado, para imprimir o compartir. */
export function creditReceiptText(r: {
  businessName: string;
  customerName: string;
  amountCents: number;
  methodLabel: string;
  at: Date;
  balanceAfterCents: number;
}): string {
  const when = `${formatDate(r.at)} ${formatTime(r.at)}`;
  return [
    `${r.businessName} · Recibo de pago`,
    `${r.customerName} pagó ${formatMoney(r.amountCents)} (${r.methodLabel.toLowerCase()}) el ${when}.`,
    r.balanceAfterCents > 0
      ? `Saldo pendiente: ${formatMoney(r.balanceAfterCents)}.`
      : r.balanceAfterCents < 0
        ? `Saldo a favor: ${formatMoney(-r.balanceAfterCents)}.`
        : "Cuenta al día. ¡Gracias!",
  ].join("\n");
}

/** Estado de cuenta corto para mandar por WhatsApp (el detalle va en el PDF). */
export function statementText(s: {
  businessName: string;
  customerName: string;
  asOf: DateStr;
  balanceCents: number;
  overdueCents: number;
  open: { date: DateStr; openCents: number }[];
}): string {
  const out = [
    `Hola ${s.customerName.split(" ")[0]}, te paso tu cuenta en ${s.businessName} al ${formatDate(s.asOf)}:`,
  ];
  for (const o of s.open)
    out.push(`• Compra del ${formatDate(o.date).slice(0, 5)}: ${formatMoney(o.openCents)}`);
  out.push(
    s.balanceCents >= 0
      ? `Saldo: ${formatMoney(s.balanceCents)}.`
      : `Saldo a favor: ${formatMoney(-s.balanceCents)}.`,
  );
  if (s.overdueCents > 0) out.push(`Vencido: ${formatMoney(s.overdueCents)}.`);
  return out.join("\n");
}
