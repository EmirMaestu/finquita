/** Ticket no fiscal de 58 mm (32 caracteres) u 80 mm (48 caracteres). */
import { METHOD_LABEL } from "./cash";
import { formatDate, formatTime } from "./dates";
import { formatMoney } from "./money";
import { formatQty } from "./qty";
import type { PaymentMethodCode } from "./sync";

export type TicketData = {
  business: { name: string; address?: string | null; city?: string | null };
  number: number;
  at: Date;
  cashier: string;
  customer?: string | null;
  lines: {
    description: string;
    qty: number;
    unit: "unit" | "kg";
    unitPriceCents: number;
    totalCents: number;
    discountCents?: number;
    kind?: string;
  }[];
  discountCents?: number;
  surchargeCents?: number;
  totalCents: number;
  payments: { method: PaymentMethodCode; amountCents: number }[];
  changeCents: number;
  footer?: string | null;
  voided?: boolean;
};

export type TicketWidth = 58 | 80;
export const TICKET_CHARS: Record<TicketWidth, number> = { 58: 32, 80: 48 };

const center = (s: string, w: number) => {
  const t = s.slice(0, w);
  return " ".repeat(Math.floor((w - t.length) / 2)) + t;
};

/** Texto a la izquierda y monto a la derecha, en el ancho del papel. */
const lr = (left: string, right: string, w: number) => {
  const space = w - left.length - right.length;
  if (space >= 1) return left + " ".repeat(space) + right;
  return `${left.slice(0, Math.max(0, w - right.length - 1))} ${right}`;
};

const wrap = (s: string, w: number) => {
  const out: string[] = [];
  let rest = s;
  while (rest.length > w) {
    const cut = rest.lastIndexOf(" ", w);
    const at = cut > w / 2 ? cut : w;
    out.push(rest.slice(0, at));
    rest = rest.slice(at).trimStart();
  }
  out.push(rest);
  return out;
};

/** Las líneas del ticket, listas para imprimir en monoespaciado. */
export function ticketLines(t: TicketData, width: TicketWidth = 58): string[] {
  const w = TICKET_CHARS[width];
  const rule = "-".repeat(w);
  const out: string[] = [];
  out.push(center(t.business.name.toUpperCase(), w));
  const addr = [t.business.address, t.business.city?.split(",")[0]].filter(Boolean).join(", ");
  if (addr) for (const l of wrap(addr, w)) out.push(center(l, w));
  out.push(rule);
  out.push(
    lr(`Venta ${String(t.number).padStart(6, "0")}`, `${formatDate(t.at)} ${formatTime(t.at)}`, w),
  );
  out.push(`Cajero: ${t.cashier}`);
  if (t.customer) out.push(`Cliente: ${t.customer}`);
  if (t.voided) out.push(center("*** ANULADA ***", w));
  out.push(rule);
  for (const l of t.lines) {
    for (const d of wrap(l.description, w)) out.push(d);
    if (l.kind === "promo" || l.kind === "discount") {
      out.push(lr("", formatMoney(l.totalCents).replace("$", "-$").replace("−", ""), w));
      continue;
    }
    const qty = l.unit === "kg" ? formatQty(l.qty, "kg") : formatQty(l.qty);
    out.push(
      lr(
        `  ${qty} x ${formatMoney(l.unitPriceCents)}`,
        formatMoney(l.totalCents + (l.discountCents ?? 0)),
        w,
      ),
    );
    if (l.discountCents) out.push(lr("  Descuento", `-${formatMoney(l.discountCents)}`, w));
  }
  out.push(rule);
  if (t.discountCents) out.push(lr("Descuento", `-${formatMoney(t.discountCents)}`, w));
  if (t.surchargeCents) out.push(lr("Recargo", formatMoney(t.surchargeCents), w));
  out.push(lr("TOTAL", formatMoney(t.totalCents), w));
  for (const p of t.payments) out.push(lr(METHOD_LABEL[p.method], formatMoney(p.amountCents), w));
  if (t.changeCents) out.push(lr("Vuelto", formatMoney(t.changeCents), w));
  out.push(rule);
  out.push(center("Documento no válido como factura", w));
  out.push(center(t.footer ?? "¡Gracias por tu compra!", w));
  return out;
}
