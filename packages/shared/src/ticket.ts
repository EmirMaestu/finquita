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

export type ClosingData = {
  business: { name: string };
  registerName: string;
  shiftLabel: string;
  cashier: string;
  openedAt: Date;
  closedAt: Date;
  lines: { label: string; amountCents: number }[];
  expectedCashCents: number;
  countedCashCents: number;
  differenceCents: number;
  byMethod: { label: string; amountCents: number; count: number }[];
  salesCents: number;
  leftFloatCents: number;
  withdrawnCents: number;
  note?: string | null;
};

/** Comprobante de cierre de turno, para imprimir o compartir. */
export function closingLines(c: ClosingData, width: TicketWidth = 58): string[] {
  const w = TICKET_CHARS[width];
  const rule = "-".repeat(w);
  const signed = (v: number) =>
    v > 0 ? `+${formatMoney(v)}` : v < 0 ? `-${formatMoney(Math.abs(v))}` : formatMoney(0);
  const out = [center(c.business.name.toUpperCase(), w), center("CIERRE DE CAJA", w), rule];
  out.push(`${c.registerName} · ${c.shiftLabel}`);
  out.push(`Cajero: ${c.cashier}`);
  out.push(lr("Apertura", `${formatDate(c.openedAt)} ${formatTime(c.openedAt)}`, w));
  out.push(lr("Cierre", `${formatDate(c.closedAt)} ${formatTime(c.closedAt)}`, w));
  out.push(rule);
  for (const l of c.lines) out.push(lr(l.label.slice(0, w - 12), formatMoney(l.amountCents), w));
  out.push(lr("Efectivo esperado", formatMoney(c.expectedCashCents), w));
  out.push(lr("Efectivo contado", formatMoney(c.countedCashCents), w));
  out.push(lr("Diferencia", signed(c.differenceCents), w));
  out.push(rule);
  for (const m of c.byMethod)
    out.push(lr(`${m.label} (${m.count})`, formatMoney(m.amountCents), w));
  out.push(lr("Ventas del turno", formatMoney(c.salesCents), w));
  out.push(rule);
  out.push(lr("Queda de fondo", formatMoney(c.leftFloatCents), w));
  out.push(lr("Se retira", formatMoney(c.withdrawnCents), w));
  if (c.note) {
    out.push(rule);
    out.push(...wrap(`Comentario: ${c.note}`, w));
  }
  return out;
}
