/** Redondea a tres decimales (cantidades y pesos). */
export function roundQty(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Precio × cantidad, redondeado al centavo. */
export function lineTotal(unitPriceCents: number, qty: number): number {
  return Math.round(unitPriceCents * qty);
}

const kgFmt = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const qtyFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

/** 0,350 kg */
export function formatKg(kg: number): string {
  return `${kgFmt.format(kg)} kg`;
}

/** Cantidad según la unidad: "3" o "0,750 kg". */
export function formatQty(q: number, unit: "unit" | "kg" | "100g" = "unit"): string {
  return unit === "unit" ? qtyFmt.format(q) : formatKg(q);
}
