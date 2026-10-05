/** Recepción de mercadería: aviso de costo que cambió y resumen de diferencias. */
import { formatMoney } from "./money";
import { priceFromMargin } from "./pricing";
import { formatQty } from "./qty";

export type CostChange = {
  /** Porcentaje entero con signo: +12 o −5. */
  pct: number;
  up: boolean;
  suggestedPriceCents: number;
  text: string;
  priceText: string;
};

/**
 * "El costo subió 12 %: $ 2.100 → $ 2.350" y "Precio sugerido con tu 44 %: $ 3.400 (hoy $ 3.000)".
 * null si el costo no cambió o no había costo anterior.
 */
export function costChange(o: {
  previousCostCents: number | null | undefined;
  costCents: number | null | undefined;
  priceCents: number;
  marginBp: number;
  roundingCents: number;
}): CostChange | null {
  const prev = o.previousCostCents ?? null;
  const next = o.costCents ?? null;
  if (prev == null || next == null || prev <= 0 || prev === next) return null;
  const pct = Math.round(((next - prev) / prev) * 100);
  const up = next > prev;
  const suggestedPriceCents = priceFromMargin(next, o.marginBp, o.roundingCents);
  const pctText = `${Math.abs(pct) || "menos de 1"} %`;
  return {
    pct,
    up,
    suggestedPriceCents,
    text: `El costo ${up ? "subió" : "bajó"} ${pctText}: ${formatMoney(prev)} → ${formatMoney(next)}`,
    priceText: `Precio sugerido con tu ${Math.round(o.marginBp / 100)} %: ${formatMoney(suggestedPriceCents)} (hoy ${formatMoney(o.priceCents)})`,
  };
}

export type ReceiptLineInput = {
  name: string;
  ordered: number | null;
  received: number;
  damaged: number;
  unit?: "unit" | "kg";
};

export type ReceiptSummary = {
  missing: { name: string; qty: number }[];
  extra: { name: string; qty: number }[];
  damaged: { name: string; qty: number }[];
  /** Lo pedido que no se tocó: cuenta como faltante entero. */
  hasDifferences: boolean;
  lines: string[];
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Resumen antes de confirmar: faltantes, sobrantes y dañados. */
export function receiptSummary(lines: ReceiptLineInput[]): ReceiptSummary {
  const missing: ReceiptSummary["missing"] = [];
  const extra: ReceiptSummary["extra"] = [];
  const damaged: ReceiptSummary["damaged"] = [];
  const text: string[] = [];
  for (const l of lines) {
    const u = l.unit ?? "unit";
    const f = (n: number) => (u === "unit" ? `${formatQty(n, "unit")} u` : formatQty(n, "kg"));
    if (l.ordered != null && l.received < l.ordered) {
      const q = r3(l.ordered - l.received);
      missing.push({ name: l.name, qty: q });
      text.push(`Faltan ${f(q)} de ${l.name}`);
    } else if (l.received > (l.ordered ?? 0)) {
      const q = r3(l.received - (l.ordered ?? 0));
      extra.push({ name: l.name, qty: q });
      text.push(
        l.ordered == null ? `Llegó sin pedir: ${f(q)} de ${l.name}` : `Sobran ${f(q)} de ${l.name}`,
      );
    }
    if (l.damaged > 0) {
      damaged.push({ name: l.name, qty: l.damaged });
      text.push(`Dañados: ${f(l.damaged)} de ${l.name}`);
    }
  }
  return { missing, extra, damaged, hasDifferences: text.length > 0, lines: text };
}
