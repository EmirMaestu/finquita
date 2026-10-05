import { describe, expect, it } from "vitest";
import {
  formatPercent,
  marginOnCostBp,
  marginOnPriceBp,
  priceFromMargin,
  roundPrice,
  stockState,
} from "./pricing";

describe("precios", () => {
  it("ganancia sobre costo y margen sobre precio", () => {
    expect(marginOnCostBp(485000, 690000)).toBe(4227);
    expect(marginOnPriceBp(485000, 690000)).toBe(2971);
    expect(marginOnCostBp(0, 100)).toBeNull();
  });
  it("precio desde la ganancia, redondeado hacia arriba", () => {
    expect(priceFromMargin(485000, 4200, 5000)).toBe(690000);
    expect(roundPrice(688700, 1000)).toBe(689000);
    expect(roundPrice(688700, 10000)).toBe(690000);
  });
  it("estado de stock", () => {
    expect(stockState(14, 12)).toBe("ok");
    expect(stockState(3, 8)).toBe("low");
    expect(stockState(0, 24)).toBe("out");
    expect(stockState(-2, 6)).toBe("negative");
  });
  it("porcentajes", () => {
    expect(formatPercent(800, { sign: true })).toBe("+8 %");
    expect(formatPercent(-1200)).toBe("−12 %");
  });
});
