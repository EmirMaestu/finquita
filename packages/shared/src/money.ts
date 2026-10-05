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
