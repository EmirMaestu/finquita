/** Pesables sin balanza etiquetadora: el peso se tipea; o se pide plata y se corta el peso. */
import { lineTotal, roundQty } from "./qty";

/** Importe de una pesada: 0,750 kg × $ 3.800 = $ 2.850. */
export function priceForWeight(pricePerKgCents: number, kg: number): number {
  return lineTotal(pricePerKgCents, roundQty(kg));
}

/** Gramos a cortar para una plata pedida: "$ 2.000 de queso" a $ 13.500/kg → 148 g. */
export function gramsForMoney(moneyCents: number, pricePerKgCents: number): number {
  if (pricePerKgCents <= 0) return 0;
  return Math.round((moneyCents * 1000) / pricePerKgCents);
}

/** "Cortá 148 g" (o "Cortá 1,250 kg" desde el kilo). */
export function cutLabel(grams: number): string {
  if (grams >= 1000) {
    const kg = new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(grams / 1000);
    return `Cortá ${kg} kg`;
  }
  return `Cortá ${grams} g`;
}

/** Lo tipeado en el teclado de peso: "235" son 235 g = 0,235 kg. */
export function typedGramsToKg(typed: string): number {
  const n = Number(typed.replace(/\D/g, "") || "0");
  return roundQty(n / 1000);
}

/** Atajos del teclado de peso. */
export const WEIGHT_SHORTCUTS: [string, number][] = [
  ["100 g", 100],
  ["¼ kg", 250],
  ["½ kg", 500],
];
