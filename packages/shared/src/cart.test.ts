import { describe, expect, it } from "vitest";
import {
  addMisc,
  addProduct,
  bumpQty,
  cartTotals,
  discountFor,
  emptyCart,
  overDiscountCap,
  removeLine,
  saleNumberLabel,
  setQty,
} from "./cart";

const coca = {
  id: "coca",
  name: "Coca-Cola 2,25 L",
  priceCents: 460000,
  saleUnit: "unit" as const,
  categoryId: null,
};
const yerba = {
  id: "yerba",
  name: "Yerba Playadito 1 kg",
  priceCents: 690000,
  saleUnit: "unit" as const,
  categoryId: null,
};
const pan = {
  id: "pan",
  name: "Pan francés",
  priceCents: 380000,
  saleUnit: "kg" as const,
  categoryId: null,
};
const jamon = {
  id: "jamon",
  name: "Jamón cocido",
  priceCents: 2100000,
  saleUnit: "kg" as const,
  categoryId: null,
};

describe("carrito", () => {
  it("escanear dos veces suma cantidad; los pesables van en su propia línea", () => {
    let c = addProduct(emptyCart(), coca).cart;
    c = addProduct(c, coca).cart;
    expect(c.lines).toHaveLength(1);
    expect(c.lines[0]?.qty).toBe(2);
    c = addProduct(c, pan, 0.25).cart;
    c = addProduct(c, pan, 0.5).cart;
    expect(c.lines).toHaveLength(3);
  });

  it("el flujo 1 suma $ 18.550 en 4 ítems", () => {
    let c = addProduct(emptyCart(), coca).cart;
    c = addProduct(c, yerba).cart;
    c = addProduct(c, pan, 0.75).cart;
    c = addProduct(c, jamon, 0.2).cart;
    expect(cartTotals(c)).toEqual({
      itemCount: 4,
      subtotalCents: 1855000,
      discountCents: 0,
      totalCents: 1855000,
    });
  });

  it("+ y − cambian la cantidad; en cero se quita", () => {
    let { cart, lineId } = addProduct(emptyCart(), coca, 3);
    cart = bumpQty(cart, lineId, -1);
    expect(cart.lines[0]?.qty).toBe(2);
    cart = setQty(cart, lineId, 0);
    expect(cart.lines).toHaveLength(0);
    const p = addProduct(emptyCart(), pan, 0.25);
    expect(bumpQty(p.cart, p.lineId, 1).lines[0]?.qty).toBe(0.35);
    expect(removeLine(p.cart, p.lineId).lines).toEqual([]);
  });

  it("producto varios y descuentos con tope", () => {
    const c = addMisc(emptyCart(), { amountCents: 150000 });
    expect(c.lines[0]).toMatchObject({
      kind: "misc",
      description: "Varios",
      unitPriceCents: 150000,
    });
    expect(discountFor(1855000, { percentBp: 1000 })).toBe(185500);
    expect(overDiscountCap(1855000, 278250, 1000)).toBe(true);
    expect(overDiscountCap(1855000, 185500, 1000)).toBe(false);
    expect(saleNumberLabel(4187)).toBe("Venta 004187");
  });
});
