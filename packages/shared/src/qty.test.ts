import { describe, expect, it } from "vitest";
import { formatKg, formatQty, lineTotal, roundQty } from "./qty";

describe("cantidades", () => {
  it("redondea a tres decimales y calcula el total de línea", () => {
    expect(roundQty(6.4 - 0.75)).toBe(5.65);
    expect(lineTotal(380000, 0.75)).toBe(285000);
    expect(lineTotal(2100000, 0.2)).toBe(420000);
  });
  it("formatea en kg con tres decimales", () => {
    expect(formatKg(0.35)).toBe("0,350 kg");
    expect(formatQty(3)).toBe("3");
    expect(formatQty(0.75, "kg")).toBe("0,750 kg");
  });
});
