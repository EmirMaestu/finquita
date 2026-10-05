/** Ganancia sobre costo (como se dice en el mostrador) y estados de stock. */

/** Ganancia sobre costo en puntos básicos: costo 4.850, precio 6.900 → 4227 (42 %). */
export function marginOnCostBp(costCents: number, priceCents: number): number | null {
  if (!costCents) return null;
  return Math.round((priceCents / costCents - 1) * 10000);
}

/** Margen sobre precio (lo que usan los reportes), en puntos básicos. */
export function marginOnPriceBp(costCents: number, priceCents: number): number | null {
  if (!priceCents) return null;
  return Math.round(((priceCents - costCents) / priceCents) * 10000);
}

/** Redondea hacia arriba al múltiplo: así el redondeo nunca come ganancia. */
export function roundPrice(cents: number, roundingCents: number): number {
  if (roundingCents <= 1) return Math.round(cents);
  return Math.ceil(Math.round(cents) / roundingCents) * roundingCents;
}

/** Precio desde el costo y la ganancia: 4.850 + 42 % redondeado a $ 50 → 6.900. */
export function priceFromMargin(
  costCents: number,
  marginBp: number,
  roundingCents: number,
): number {
  return roundPrice((costCents * (10000 + marginBp)) / 10000, roundingCents);
}

export type StockState = "ok" | "low" | "out" | "negative";

export function stockState(stock: number, min: number | null): StockState {
  if (stock < 0) return "negative";
  if (stock === 0) return "out";
  if (min !== null && stock < min) return "low";
  return "ok";
}

/** "15 %" · "+8 %" · "42,3 %" */
export function formatPercent(
  bp: number,
  opts: { sign?: boolean; decimals?: number } = {},
): string {
  const v = bp / 100;
  const f = new Intl.NumberFormat("es-AR", { maximumFractionDigits: opts.decimals ?? 0 }).format(
    Math.abs(v),
  );
  const sign = v < 0 ? "−" : opts.sign && v > 0 ? "+" : "";
  return `${sign}${f} %`;
}

/**
 * Contenido neto desde el nombre ("Yerba Playadito 1 kg", "Coca-Cola 2,25 L", "Fideos 500 g")
 * para mostrar el precio por kilo o por litro en la etiqueta.
 */
export function contentFromName(name: string): { qty: number; unit: "kg" | "l" } | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(kg|g|gr|l|lt|ml|cc)\b/i.exec(name);
  if (!m) return null;
  const n = Number((m[1] ?? "").replace(",", "."));
  if (!n) return null;
  const u = (m[2] ?? "").toLowerCase();
  if (u === "kg") return { qty: n, unit: "kg" };
  if (u === "g" || u === "gr") return { qty: n / 1000, unit: "kg" };
  if (u === "l" || u === "lt") return { qty: n, unit: "l" };
  return { qty: n / 1000, unit: "l" };
}

/** Precio por kilo o litro: "$ 6.900 / kg". */
export function unitPriceCents(priceCents: number, content: { qty: number }): number {
  return Math.round(priceCents / content.qty);
}
