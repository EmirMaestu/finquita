/** Carrito de Vender: líneas, cantidades, descuentos y totales. Reglas iguales en todos lados. */
import { newId } from "./ids";
import { lineTotal, roundQty } from "./qty";

export type CartLine = {
  id: string;
  kind: "product" | "misc" | "promo" | "container" | "discount";
  productId: string | null;
  categoryId: string | null;
  description: string;
  qty: number;
  unit: "unit" | "kg";
  unitPriceCents: number;
  /** Descuento de la línea, en centavos. */
  discountCents: number;
  note?: string | null;
  promotionId?: string | null;
  /** Para avisos: +18, sin stock. */
  ageRestricted?: boolean;
};

export type Cart = { lines: CartLine[]; customerId: string | null; discountCents: number };

export const emptyCart = (): Cart => ({ lines: [], customerId: null, discountCents: 0 });

export type SellableProduct = {
  id: string;
  name: string;
  priceCents: number;
  saleUnit: "unit" | "kg" | "100g";
  categoryId: string | null;
  ageRestricted?: boolean;
};

export function lineAmount(l: CartLine): number {
  return lineTotal(l.unitPriceCents, l.qty) - l.discountCents;
}

/**
 * Agrega un producto. Escanear dos veces el mismo producto suma cantidad (no repite la línea);
 * los pesables van en una línea por pesada.
 */
export function addProduct(
  cart: Cart,
  p: SellableProduct,
  qty = 1,
): { cart: Cart; lineId: string } {
  const unit = p.saleUnit === "unit" ? "unit" : "kg";
  if (unit === "unit") {
    const existing = cart.lines.find(
      (l) =>
        l.productId === p.id &&
        l.kind === "product" &&
        l.unitPriceCents === p.priceCents &&
        !l.discountCents,
    );
    if (existing) {
      return {
        cart: {
          ...cart,
          lines: cart.lines.map((l) => (l === existing ? { ...l, qty: roundQty(l.qty + qty) } : l)),
        },
        lineId: existing.id,
      };
    }
  }
  const line: CartLine = {
    id: newId(),
    kind: "product",
    productId: p.id,
    categoryId: p.categoryId,
    description: p.name,
    qty: roundQty(qty),
    unit,
    unitPriceCents: p.saleUnit === "100g" ? p.priceCents * 10 : p.priceCents,
    discountCents: 0,
    ageRestricted: p.ageRestricted ?? false,
  };
  return { cart: { ...cart, lines: [...cart.lines, line] }, lineId: line.id };
}

/** Producto varios (F3): monto, descripción opcional y categoría. */
export function addMisc(
  cart: Cart,
  a: { amountCents: number; description?: string; categoryId?: string | null },
): Cart {
  const line: CartLine = {
    id: newId(),
    kind: "misc",
    productId: null,
    categoryId: a.categoryId ?? null,
    description: a.description?.trim() || "Varios",
    qty: 1,
    unit: "unit",
    unitPriceCents: a.amountCents,
    discountCents: 0,
  };
  return { ...cart, lines: [...cart.lines, line] };
}

export function setQty(cart: Cart, lineId: string, qty: number): Cart {
  if (qty <= 0) return removeLine(cart, lineId);
  return {
    ...cart,
    lines: cart.lines.map((l) => (l.id === lineId ? { ...l, qty: roundQty(qty) } : l)),
  };
}

/** + y − sobre la línea elegida (en pesables suman o restan 100 g). */
export function bumpQty(cart: Cart, lineId: string, dir: 1 | -1): Cart {
  const l = cart.lines.find((x) => x.id === lineId);
  if (!l) return cart;
  const step = l.unit === "kg" ? 0.1 : 1;
  return setQty(cart, lineId, l.qty + dir * step);
}

export function removeLine(cart: Cart, lineId: string): Cart {
  return { ...cart, lines: cart.lines.filter((l) => l.id !== lineId) };
}

export function updateLine(
  cart: Cart,
  lineId: string,
  patch: Partial<Pick<CartLine, "qty" | "unitPriceCents" | "discountCents" | "note">>,
): Cart {
  return {
    ...cart,
    lines: cart.lines.map((l) =>
      l.id === lineId ? { ...l, ...patch, qty: roundQty(patch.qty ?? l.qty) } : l,
    ),
  };
}

export type CartTotals = {
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
};

/** Cantidad de ítems (los pesables cuentan uno por línea), subtotal, descuentos y total. */
export function cartTotals(cart: Cart): CartTotals {
  const products = cart.lines.filter((l) => l.kind !== "promo" && l.kind !== "discount");
  const itemCount = products.reduce((s, l) => s + (l.unit === "kg" ? 1 : l.qty), 0);
  const subtotal = cart.lines.reduce((s, l) => s + lineAmount(l), 0);
  return {
    itemCount: Math.round(itemCount * 1000) / 1000,
    subtotalCents: subtotal,
    discountCents: cart.discountCents,
    totalCents: subtotal - cart.discountCents,
  };
}

/** Descuento general sobre el total: en porcentaje (puntos básicos) o en plata. */
export function discountFor(
  subtotalCents: number,
  d: { percentBp?: number; cents?: number },
): number {
  if (d.cents !== undefined) return Math.max(0, Math.min(subtotalCents, d.cents));
  return Math.round((subtotalCents * (d.percentBp ?? 0)) / 10000);
}

/** El descuento supera el tope configurado (pide PIN al cajero). */
export function overDiscountCap(
  subtotalCents: number,
  discountCents: number,
  capBp: number,
): boolean {
  if (!subtotalCents) return false;
  return discountCents * 10000 > subtotalCents * capBp;
}

/** "Venta 004187" */
export function saleNumberLabel(n: number): string {
  return `Venta ${String(n).padStart(6, "0")}`;
}
