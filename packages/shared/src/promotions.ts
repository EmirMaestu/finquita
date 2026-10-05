/** Promociones que se aplican solas y se ven como línea propia en la venta. */
import { type Cart, type CartLine, lineAmount } from "./cart";
import { type DateStr, weekday } from "./dates";
import { newId } from "./ids";

export type PromotionKind =
  | "two_for_one"
  | "three_for_two"
  | "nth_unit"
  | "category_percent"
  | "combo"
  | "weekday";

export type Promotion = {
  id: string;
  name: string;
  kind: PromotionKind;
  /** n (enésima unidad), percentBp, comboPriceCents. */
  params: { n?: number; percentBp?: number; comboPriceCents?: number };
  categoryId?: string | null;
  /** Productos (con la cantidad que pide el combo). */
  products: { productId: string; qty: number }[];
  startsOn?: DateStr | null;
  endsOn?: DateStr | null;
  /** Días de la semana (0 = domingo); vacío = todos. */
  weekdays?: number[] | null;
  active: boolean;
};

export const PROMO_LABEL: Record<PromotionKind, string> = {
  two_for_one: "2×1",
  three_for_two: "3×2",
  nth_unit: "Enésima unidad",
  category_percent: "% por categoría",
  combo: "Combo",
  weekday: "Día de la semana",
};

/** Vigente hoy: activa, dentro de las fechas y en sus días. */
export function promoActiveOn(p: Promotion, day: DateStr): boolean {
  if (!p.active) return false;
  if (p.startsOn && day < p.startsOn) return false;
  if (p.endsOn && day > p.endsOn) return false;
  if (p.weekdays?.length && !p.weekdays.includes(weekday(day))) return false;
  return true;
}

export type PromoStatus = "active" | "scheduled" | "ended";

export function promoStatus(p: Promotion, day: DateStr): PromoStatus {
  if (!p.active || (p.endsOn && day > p.endsOn)) return "ended";
  if (p.startsOn && day < p.startsOn) return "scheduled";
  return "active";
}

type Unit = {
  productId: string;
  categoryId: string | null;
  qty: number;
  priceCents: number;
  description: string;
  lineTotal: number;
};

function units(cart: Cart): Unit[] {
  const byProduct = new Map<string, Unit>();
  for (const l of cart.lines) {
    if (l.kind !== "product" || !l.productId) continue;
    const u = byProduct.get(l.productId) ?? {
      productId: l.productId,
      categoryId: l.categoryId,
      qty: 0,
      priceCents: l.unitPriceCents,
      description: l.description,
      lineTotal: 0,
    };
    u.qty += l.qty;
    u.lineTotal += lineAmount(l);
    byProduct.set(l.productId, u);
  }
  return [...byProduct.values()];
}

/** Cuánto descuenta una promoción sobre el carrito (0 si no aplica). */
export function promoDiscount(p: Promotion, cart: Cart): { cents: number; label: string } {
  const us = units(cart);
  const of = (id: string) => us.find((u) => u.productId === id);
  const inPromo = (u: Unit) =>
    p.products.some((x) => x.productId === u.productId) ||
    (p.categoryId ? u.categoryId === p.categoryId : false);
  const pct = p.params.percentBp ?? 0;
  switch (p.kind) {
    case "two_for_one":
    case "three_for_two": {
      const every = p.kind === "two_for_one" ? 2 : 3;
      let cents = 0;
      const names: string[] = [];
      for (const u of us.filter(inPromo)) {
        if (u.qty < every) continue;
        const free = Math.floor(u.qty / every);
        cents += free * u.priceCents;
        names.push(u.description);
      }
      return { cents, label: `${PROMO_LABEL[p.kind]} ${names.join(", ")}` };
    }
    case "nth_unit": {
      const n = p.params.n ?? 2;
      let cents = 0;
      const names: string[] = [];
      for (const u of us.filter(inPromo)) {
        const times = Math.floor(u.qty / n);
        if (!times) continue;
        cents += Math.round((times * u.priceCents * pct) / 10000);
        names.push(u.description);
      }
      return {
        cents,
        label: `${n}.ª unidad al ${100 - pct / 100} % ${names.join(", ")}`,
      };
    }
    case "category_percent":
    case "weekday": {
      const base = us.filter(inPromo).reduce((s, u) => s + u.lineTotal, 0);
      return { cents: Math.round((base * pct) / 10000), label: p.name };
    }
    case "combo": {
      if (!p.products.length || p.params.comboPriceCents === undefined)
        return { cents: 0, label: p.name };
      const times = Math.min(
        ...p.products.map((x) => Math.floor((of(x.productId)?.qty ?? 0) / x.qty)),
      );
      if (!Number.isFinite(times) || times <= 0) return { cents: 0, label: p.name };
      const regular = p.products.reduce(
        (s, x) => s + (of(x.productId)?.priceCents ?? 0) * x.qty,
        0,
      );
      return { cents: Math.max(0, times * (regular - p.params.comboPriceCents)), label: p.name };
    }
  }
}

/**
 * Recalcula las líneas de promoción del carrito: saca las anteriores y agrega una línea
 * por promoción que aplique ("Promo 2×1 Coca-Cola 2,25 L −$ 4.600").
 */
export function applyPromotions(cart: Cart, promos: Promotion[], day: DateStr): Cart {
  const base: Cart = { ...cart, lines: cart.lines.filter((l) => l.kind !== "promo") };
  const lines: CartLine[] = [];
  for (const p of promos) {
    if (!promoActiveOn(p, day)) continue;
    const d = promoDiscount(p, base);
    if (d.cents <= 0) continue;
    lines.push({
      id: newId(),
      kind: "promo",
      productId: null,
      categoryId: p.categoryId ?? null,
      description: `Promo ${d.label}`.trim(),
      qty: 1,
      unit: "unit",
      unitPriceCents: -d.cents,
      discountCents: 0,
      promotionId: p.id,
    });
  }
  return { ...base, lines: [...base.lines, ...lines] };
}
