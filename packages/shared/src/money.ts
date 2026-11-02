/** Plata en centavos (enteros). */
export type Cents = number;

const pesos = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Formato argentino: `$ 12.345,50`. Sin decimales si son cero: `$ 18.550`. */
export function formatMoney(cents: Cents): string {
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  const body =
    frac === 0 ? pesos.format(whole) : `${pesos.format(whole)},${String(frac).padStart(2, "0")}`;
  return `${sign}$ ${body}`;
}

/**
 * Lee un monto tipeado en formato argentino y devuelve centavos:
 * "6900" → 690000 · "6.900" → 690000 · "1.234,56" → 123456 · "$ 20.000" → 2000000.
 * Devuelve null si no es un número.
 */
export function parseMoney(input: string): Cents | null {
  let s = input.replace(/\$|\s/g, "").trim();
  if (!s) return null;
  // "1000.50" (sin coma y con uno o dos decimales después del punto) es 1.000,50, no 100.050.
  if (!s.includes(",") && /^-?\d+\.\d{1,2}$/.test(s)) s = s.replace(".", ",");
  if (!/^-?[\d.]*(,\d{0,2})?$/.test(s)) return null;
  const [intPart = "", frac = ""] = s.split(",");
  const digits = intPart.replace(/\./g, "");
  if (!digits && !frac) return null;
  const sign = digits.startsWith("-") ? -1 : 1;
  const whole = Number(digits.replace("-", "") || "0");
  const cents = Number(frac.padEnd(2, "0") || "0");
  return sign * (whole * 100 + cents);
}

/** Centavos a texto editable: 690000 → "6900", 123456 → "1234,56". */
export function moneyInput(cents: Cents | null | undefined): string {
  if (cents == null) return "";
  const whole = Math.trunc(cents / 100);
  const frac = Math.abs(cents % 100);
  return frac ? `${whole},${String(frac).padStart(2, "0")}` : String(whole);
}

/**
 * Lee una cantidad o un porcentaje tipeados a la argentina ("1,5", "1.000,5") y también
 * con punto decimal ("1.5", "1000.50"). "1.000" son mil. Devuelve null si no es un número.
 */
export function parseDecimal(input: string): number | null {
  let s = input.replace(/\s/g, "").trim();
  if (!s) return null;
  if (!s.includes(",") && s.includes(".")) {
    // Puntos de miles ("1.000", "12.345.678") o un decimal ("1.5", "1000.50").
    s = /^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s.replace(".", ",");
  }
  if (!/^-?[\d.]*(,\d*)?$/.test(s)) return null;
  const [intPart = "", frac = ""] = s.split(",");
  const digits = intPart.replace(/\./g, "");
  if (!digits.replace("-", "") && !frac) return null;
  const n = Number(`${digits.replace("-", "") || "0"}.${frac || "0"}`);
  if (!Number.isFinite(n)) return null;
  return digits.startsWith("-") ? -n : n;
}
