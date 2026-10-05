import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("usa punto de miles y coma decimal", () => {
    expect(formatMoney(1234550)).toBe("$ 12.345,50");
  });
  it("omite los centavos si son cero", () => {
    expect(formatMoney(1855000)).toBe("$ 18.550");
  });
  it("muestra el signo de los negativos", () => {
    expect(formatMoney(-120000)).toBe("−$ 1.200");
  });
});

import { moneyInput, parseMoney } from "./money";

describe("parseMoney", () => {
  it("lee montos tipeados en formato argentino", () => {
    expect(parseMoney("6900")).toBe(690000);
    expect(parseMoney("6.900")).toBe(690000);
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("$ 20.000")).toBe(2000000);
    expect(parseMoney("12,5")).toBe(1250);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
  it("vuelve a texto editable", () => {
    expect(moneyInput(690000)).toBe("6900");
    expect(moneyInput(123456)).toBe("1234,56");
    expect(moneyInput(null)).toBe("");
  });
});
