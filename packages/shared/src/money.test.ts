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
