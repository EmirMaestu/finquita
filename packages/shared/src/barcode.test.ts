import { describe, expect, it } from "vitest";
import { barRects, ean13CheckDigit, ean13Modules, internalBarcode, isValidEan13 } from "./barcode";

describe("EAN-13", () => {
  it("calcula el dígito verificador", () => {
    expect(ean13CheckDigit("779123400001")).toBe(2);
    expect(isValidEan13("7791234000012")).toBe(true);
    expect(isValidEan13("7791234000013")).toBe(false);
  });
  it("arma códigos internos que empiezan con 2", () => {
    expect(internalBarcode("1001")).toBe("2000000010014");
    expect(internalBarcode(2001)).toMatch(/^200000002001\d$/);
    expect(isValidEan13(internalBarcode("3002"))).toBe(true);
  });
  it("dibuja 95 franjas con las guardas", () => {
    const m = ean13Modules("7791234000012");
    expect(m).toHaveLength(95);
    expect(m.startsWith("101")).toBe(true);
    expect(m.slice(45, 50)).toBe("01010");
    expect(barRects("1101").map((r) => r.w)).toEqual([2, 1]);
  });
});
