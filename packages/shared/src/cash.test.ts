import { describe, expect, it } from "vitest";
import { countTotal, shiftName, shiftTooLong, summarizeShift } from "./cash";
import { arDateTime } from "./dates";

describe("efectivo esperado", () => {
  it("el ejemplo del spec da $ 121.900", () => {
    const s = summarizeShift(2_000_000, [
      { kind: "sale", method: "cash", amountCents: 6_000_000 },
      { kind: "sale", method: "debit", amountCents: 5_640_000 },
      { kind: "sale", method: "cash", amountCents: 3_840_000 },
      { kind: "credit_payment", method: "cash", amountCents: 800_000 },
      {
        kind: "expense",
        method: "cash",
        amountCents: -450_000,
        reason: "Artículos de limpieza",
        category: "cleaning",
      },
      { kind: "sale", method: "account", amountCents: 1_210_000 },
    ]);
    expect(s.expectedCashCents).toBe(12_190_000);
    expect(s.lines).toEqual([
      { label: "Fondo inicial", amountCents: 2_000_000 },
      { label: "Ventas en efectivo", amountCents: 9_840_000 },
      { label: "Cobros de fiado en efectivo", amountCents: 800_000 },
      { label: "Gasto: artículos de limpieza", amountCents: -450_000 },
    ]);
    expect(s.byMethod.cash).toEqual({ amountCents: 9_840_000, count: 2 });
    expect(s.byMethod.debit).toEqual({ amountCents: 5_640_000, count: 1 });
    expect(s.byMethod.account.amountCents).toBe(1_210_000);
    expect(s.salesCents).toBe(16_690_000);
  });

  it("cuenta billetes y nombra el turno", () => {
    expect(countTotal({ "20000": 5, "10000": 2, "500": 1, "200": 1 })).toBe(12_070_000);
    expect(shiftName(arDateTime("2026-10-03", "08:00"))).toBe("turno mañana");
    expect(shiftName(arDateTime("2026-10-03", "14:00"))).toBe("turno tarde");
    expect(shiftTooLong(arDateTime("2026-10-02", "14:00"), arDateTime("2026-10-03", "05:00"))).toBe(
      true,
    );
  });
});
