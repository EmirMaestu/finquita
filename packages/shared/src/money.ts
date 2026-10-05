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
  const s = input.replace(/\$|\s/g, "").trim();
  if (!s) return null;
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
