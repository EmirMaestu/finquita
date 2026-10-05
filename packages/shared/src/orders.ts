/** Pedidos a proveedores: estados, el mensaje de WhatsApp y el enlace wa.me (el bot es fase 2). */
import { type DateStr, formatDate, weekday } from "./dates";
import { formatMoney } from "./money";
import { formatQty } from "./qty";
import { packPlural } from "./suggested";

export type OrderStatus =
  | "draft"
  | "sent"
  | "confirmed"
  | "changed"
  | "partial"
  | "received"
  | "closed"
  | "cancelled";

export const ORDER_STATUS: Record<
  OrderStatus,
  { label: string; tone: "neutro" | "info" | "ok" | "alerta" | "peligro" }
> = {
  draft: { label: "Borrador", tone: "neutro" },
  sent: { label: "Enviado", tone: "info" },
  confirmed: { label: "Confirmado", tone: "ok" },
  changed: { label: "Confirmado con cambios", tone: "ok" },
  partial: { label: "Recibido parcial", tone: "alerta" },
  received: { label: "Recibido", tone: "ok" },
  closed: { label: "Cerrado", tone: "neutro" },
  cancelled: { label: "Cancelado", tone: "neutro" },
};

/**
 * Pasos que se marcan a mano en v1 (recibido parcial o total los pone la recepción).
 * Confirmado se marca cuando el proveedor responde.
 */
export const MANUAL_STEPS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["confirmed", "changed", "cancelled"],
  confirmed: ["changed", "cancelled"],
  changed: ["confirmed", "cancelled"],
  partial: ["closed"],
  received: ["closed"],
  closed: [],
  cancelled: [],
};

export function canMoveOrder(from: OrderStatus, to: OrderStatus): boolean {
  return MANUAL_STEPS[from].includes(to);
}

export const orderNumber = (n: number) => String(n).padStart(4, "0");

const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "jueves 8/10" */
export function deliveryLabel(d: DateStr): string {
  const [dd, mm] = formatDate(d).split("/");
  return `${DAY_NAMES[weekday(d)]} ${Number(dd)}/${Number(mm)}`;
}

export type OrderMessageLine = {
  description: string;
  qty: number;
  unit?: "unit" | "kg";
  packQty?: number | null;
  packName?: string | null;
  supplierCode?: string | null;
};

/** Cantidad para el proveedor: "24 u (2 cajones)" o "2,500 kg". */
export function orderQty(l: OrderMessageLine): string {
  const unit = l.unit ?? "unit";
  const base = unit === "unit" ? `${formatQty(l.qty, "unit")} u` : formatQty(l.qty, "kg");
  if (unit === "unit" && l.packQty && l.packQty > 1 && l.qty % l.packQty === 0) {
    const packs = l.qty / l.packQty;
    const name = (l.packName ?? "caja").toLowerCase();
    return `${base} (${packs} ${packs === 1 ? name : packPlural(name)})`;
  }
  return base;
}

/** El pedido escrito para mandar por WhatsApp. */
export function orderMessage(o: {
  businessName: string;
  contactName?: string | null;
  number: number;
  expectedOn?: DateStr | null;
  lines: OrderMessageLine[];
  totalCents?: number | null;
  notes?: string | null;
}): string {
  const hello = o.contactName ? `Hola ${o.contactName}` : "Hola";
  const when = o.expectedOn ? ` para el ${deliveryLabel(o.expectedOn)}` : "";
  const out = [
    `${hello}, te paso el pedido ${orderNumber(o.number)} de ${o.businessName}${when}:`,
    "",
  ];
  for (const l of o.lines)
    out.push(`• ${l.description}${l.supplierCode ? ` [${l.supplierCode}]` : ""}: ${orderQty(l)}`);
  out.push("");
  const count = o.lines.length === 1 ? "1 producto" : `${o.lines.length} productos`;
  out.push(o.totalCents ? `${count}, total estimado ${formatMoney(o.totalCents)}.` : `${count}.`);
  if (o.notes?.trim()) out.push(o.notes.trim());
  out.push("¿Me confirmás qué tenés? Gracias.");
  return out.join("\n");
}

/** Número para wa.me: solo dígitos, con código de país (54 9 + área + número). */
export function waPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = `549${d.slice(1)}`;
  if (d.startsWith("54") && !d.startsWith("549") && d.length === 12) d = `549${d.slice(2)}`;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** Enlace que abre el chat con el texto escrito. Sin número, abre WhatsApp para elegir el contacto. */
export function waLink(phone: string | null | undefined, text: string): string {
  const p = phone ? waPhone(phone) : null;
  return `https://wa.me/${p ?? ""}?text=${encodeURIComponent(text)}`;
}
