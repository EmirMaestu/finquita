import { describe, expect, it } from "vitest";
import { cutLabel, gramsForMoney, priceForWeight, typedGramsToKg } from "./weights";

describe("pesables", () => {
  it("0,750 kg de pan a $ 3.800 son $ 2.850", () => {
    expect(priceForWeight(380000, 0.75)).toBe(285000);
    expect(priceForWeight(2100000, 0.2)).toBe(420000);
  });

  it("$ 2.000 de queso a $ 13.500 el kilo: cortá 148 g", () => {
    const g = gramsForMoney(200000, 1350000);
    expect(g).toBe(148);
    expect(cutLabel(g)).toBe("Cortá 148 g");
    // Se cobra el peso real: 0,152 kg son $ 2.052.
    expect(priceForWeight(1350000, 0.152)).toBe(205200);
  });

  it("235 en el teclado son 0,235 kg", () => {
    expect(typedGramsToKg("235")).toBe(0.235);
    expect(typedGramsToKg("1250")).toBe(1.25);
    expect(cutLabel(1250)).toBe("Cortá 1,250 kg");
  });
});
