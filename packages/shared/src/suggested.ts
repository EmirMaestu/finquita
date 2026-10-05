/** Pedido sugerido: pedido = venta diaria × días a cubrir − stock − ya pedido, redondeado al bulto. */
import { addDays, type DateStr, diffDays, weekday } from "./dates";
import { formatQty } from "./qty";

/** Próximo día de entrega estrictamente después de `from` (o null si no tiene días fijos). */
export function nextDeliveryAfter(
  from: DateStr,
  deliveryDays: number[] | null | undefined,
): DateStr | null {
  if (!deliveryDays?.length) return null;
  for (let i = 1; i <= 7; i++) {
    const d = addDays(from, i);
    if (deliveryDays.includes(weekday(d))) return d;
  }
  return null;
}

export type DeliveryWindow = {
  /** Cuándo llega este pedido. */
  delivery: DateStr;
  /** Cuándo llega el pedido siguiente a este. */
  following: DateStr;
  /** Desde hoy hasta el pedido siguiente, más la reserva. */
  daysToCover: number;
};

/**
 * Días a cubrir: desde hoy hasta que llegue el pedido siguiente a este, más los días de reserva.
 * Sin días de entrega fijos, se toma que llega en `leadDays` (1 por defecto) y se repite cada semana.
 */
export function deliveryWindow(
  today: DateStr,
  deliveryDays: number[] | null | undefined,
  reserveDays: number,
  leadDays?: number | null,
): DeliveryWindow {
  const delivery =
    nextDeliveryAfter(today, deliveryDays) ?? addDays(today, Math.max(1, leadDays ?? 1));
  const following = nextDeliveryAfter(delivery, deliveryDays) ?? addDays(delivery, 7);
  return { delivery, following, daysToCover: diffDays(today, following) + reserveDays };
}

export type SuggestInput = {
  dailySales: number;
  daysToCover: number;
  stock: number;
  onOrder: number;
  minStock?: number | null;
  packQty?: number | null;
  /** Alguien anotó que se terminó: entra aunque la cuenta dé cero. */
  shortage?: boolean;
  unit?: "unit" | "kg";
};

export type Suggestion = {
  need: number;
  qty: number;
  packs: number | null;
  reason: "sales" | "minimum" | "shortage" | null;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Cantidad sugerida, redondeada para arriba al bulto. */
export function suggestQty(i: SuggestInput): Suggestion {
  const kg = i.unit === "kg";
  const need = kg
    ? round3(i.dailySales * i.daysToCover)
    : Math.ceil(round3(i.dailySales * i.daysToCover));
  const pack = i.packQty && i.packQty > 0 ? i.packQty : null;
  // El stock negativo (vendido sin stock) cuenta como cero.
  const have = Math.max(0, i.stock) + i.onOrder;
  let raw = need - have;
  let reason: Suggestion["reason"] = raw > 0 ? "sales" : null;
  const min = i.minStock ?? 0;
  if (min > 0 && have < min && min - have > raw) {
    raw = min - have;
    reason = "minimum";
  }
  if (raw <= 0 && i.shortage) {
    raw = pack ?? 1;
    reason = "shortage";
  }
  if (raw <= 0) return { need, qty: 0, packs: pack ? 0 : null, reason: null };
  if (pack) {
    const packs = Math.ceil(round3(raw / pack));
    return { need, qty: round3(packs * pack), packs, reason };
  }
  return { need, qty: kg ? round3(raw) : Math.ceil(raw), packs: null, reason };
}

const n = (q: number, unit: "unit" | "kg") =>
  unit === "kg" ? formatQty(q, "kg") : formatQty(q, "unit").replace(/ u$/, "");

/** Plural del bulto: caja → cajas, cajón → cajones, pack → packs. */
export function packPlural(name: string): string {
  const w = name.toLowerCase();
  if (w.endsWith("ón")) return `${w.slice(0, -2)}ones`;
  if (/[aeiouky]$/.test(w)) return `${w}s`;
  return `${w}es`;
}

/**
 * La cuenta en palabras:
 * "Vendés 3 por día · tiene que alcanzar 11 días · necesitás 33 · tenés 9 → pedí 24, 2 cajas de 12".
 */
export function explainSuggestion(i: SuggestInput, s: Suggestion, packName = "caja"): string {
  const unit = i.unit ?? "unit";
  const daily =
    unit === "kg"
      ? formatQty(round3(i.dailySales), "kg")
      : String(Math.round(i.dailySales * 10) / 10).replace(".", ",");
  const parts =
    i.dailySales > 0
      ? [
          `Vendés ${daily} por día`,
          `tiene que alcanzar ${i.daysToCover} días`,
          `necesitás ${n(s.need, unit)}`,
        ]
      : ["No tuvo ventas en los últimos 28 días"];
  parts.push(`tenés ${n(Math.max(0, i.stock), unit)}`);
  if (i.onOrder > 0) parts.push(`ya pediste ${n(i.onOrder, unit)}`);
  let tail: string;
  if (!s.qty) tail = "no hace falta pedir";
  else {
    tail = `pedí ${n(s.qty, unit)}`;
    if (s.packs)
      tail += `, ${s.packs === 1 ? `1 ${packName.toLowerCase()}` : `${s.packs} ${packPlural(packName)}`} de ${n(i.packQty ?? 0, unit)}`;
    if (s.reason === "minimum") tail += ` para llegar al mínimo de ${n(i.minStock ?? 0, unit)}`;
    if (s.reason === "shortage") tail += " (lo anotaron como faltante)";
  }
  return `${parts.join(" · ")} → ${tail}`;
}
