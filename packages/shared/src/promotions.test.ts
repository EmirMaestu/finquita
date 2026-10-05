import { describe, expect, it } from "vitest";
import { addProduct, cartTotals, emptyCart } from "./cart";
import { applyPromotions, type Promotion, promoStatus } from "./promotions";

const coca = {
  id: "coca",
  name: "Coca-Cola 2,25 L",
  priceCents: 460000,
  saleUnit: "unit" as const,
  categoryId: "gaseosas",
};
const birra = {
  id: "birra",
  name: "Cerveza rubia lata 473 ml",
  priceCents: 230000,
  saleUnit: "unit" as const,
  categoryId: "cervezas",
};
const yerba = {
  id: "yerba",
  name: "Yerba Playadito 1 kg",
  priceCents: 690000,
  saleUnit: "unit" as const,
  categoryId: "infusiones",
};
const lavandina = {
  id: "lav",
  name: "Lavandina 1 L",
  priceCents: 130000,
  saleUnit: "unit" as const,
  categoryId: "limpieza",
};

const promo = (p: Partial<Promotion> & Pick<Promotion, "kind">): Promotion => ({
  id: p.kind,
  name: p.name ?? p.kind,
  params: {},
  products: [],
  active: true,
  ...p,
});
const cartOf = (...items: [typeof coca, number][]) =>
  items.reduce((c, [p, q]) => addProduct(c, p, q).cart, emptyCart());
const SATURDAY = "2026-10-03";

describe("promociones en el carrito", () => {
  it("2×1: dos Coca-Cola pagan una, como línea propia", () => {
    const c = applyPromotions(
      cartOf([coca, 2]),
      [promo({ kind: "two_for_one", products: [{ productId: "coca", qty: 1 }] })],
      SATURDAY,
    );
    const line = c.lines.find((l) => l.kind === "promo");
    expect(line).toMatchObject({
      description: "Promo 2×1 Coca-Cola 2,25 L",
      unitPriceCents: -460000,
    });
    expect(cartTotals(c).totalCents).toBe(460000);
  });

  it("3×2: llevás 3, pagás 2", () => {
    const c = applyPromotions(
      cartOf([birra, 4]),
      [promo({ kind: "three_for_two", products: [{ productId: "birra", qty: 1 }] })],
      SATURDAY,
    );
    expect(cartTotals(c).totalCents).toBe(230000 * 3);
  });

  it("enésima unidad: la segunda al 50 %", () => {
    const c = applyPromotions(
      cartOf([birra, 2]),
      [
        promo({
          kind: "nth_unit",
          params: { n: 2, percentBp: 5000 },
          products: [{ productId: "birra", qty: 1 }],
        }),
      ],
      SATURDAY,
    );
    expect(cartTotals(c).totalCents).toBe(230000 + 115000);
  });

  it("% por categoría: 10 % en limpieza", () => {
    const c = applyPromotions(
      cartOf([lavandina, 2], [yerba, 1]),
      [
        promo({
          kind: "category_percent",
          name: "10 % Limpieza",
          params: { percentBp: 1000 },
          categoryId: "limpieza",
        }),
      ],
      SATURDAY,
    );
    expect(c.lines.find((l) => l.kind === "promo")?.unitPriceCents).toBe(-26000);
    expect(cartTotals(c).totalCents).toBe(260000 + 690000 - 26000);
  });

  it("combo a precio fijo: yerba + coca a $ 10.000", () => {
    const combo = promo({
      kind: "combo",
      name: "Combo mate",
      params: { comboPriceCents: 1000000 },
      products: [
        { productId: "yerba", qty: 1 },
        { productId: "coca", qty: 1 },
      ],
    });
    expect(
      cartTotals(applyPromotions(cartOf([yerba, 1], [coca, 1]), [combo], SATURDAY)).totalCents,
    ).toBe(1000000);
    // Falta un producto del combo: no aplica.
    expect(cartTotals(applyPromotions(cartOf([yerba, 1]), [combo], SATURDAY)).totalCents).toBe(
      690000,
    );
  });

  it("día de la semana: 15 % en cervezas solo los sábados", () => {
    const sat = promo({
      kind: "weekday",
      name: "Sábado cervecero",
      params: { percentBp: 1500 },
      categoryId: "cervezas",
      weekdays: [6],
    });
    expect(cartTotals(applyPromotions(cartOf([birra, 2]), [sat], SATURDAY)).totalCents).toBe(
      460000 - 69000,
    );
    expect(cartTotals(applyPromotions(cartOf([birra, 2]), [sat], "2026-10-05")).totalCents).toBe(
      460000,
    );
  });

  it("vigencia: programada, activa y terminada; recalcular no duplica la línea", () => {
    const p = promo({
      kind: "two_for_one",
      products: [{ productId: "coca", qty: 1 }],
      startsOn: "2026-10-06",
      endsOn: "2026-10-12",
    });
    expect(promoStatus(p, SATURDAY)).toBe("scheduled");
    expect(promoStatus(p, "2026-10-08")).toBe("active");
    expect(promoStatus(p, "2026-10-13")).toBe("ended");
    const active = { ...p, startsOn: null };
    let c = applyPromotions(cartOf([coca, 2]), [active], SATURDAY);
    c = applyPromotions(c, [active], SATURDAY);
    expect(c.lines.filter((l) => l.kind === "promo")).toHaveLength(1);
  });
});
