import { describe, expect, it } from "vitest";
import { creditSummary, openCharges } from "./credit";

describe("cuenta corriente", () => {
  it("los pagos cancelan lo más viejo primero", () => {
    const entries = [
      { id: "a", amountCents: 400000, date: "2026-09-02", dueOn: "2026-10-02" },
      { id: "b", amountCents: 620000, date: "2026-09-13", dueOn: "2026-10-13" },
      { id: "p", amountCents: -240000, date: "2026-09-23" },
    ];
    const { open } = openCharges(entries);
    expect(open.map((c) => [c.id, c.openCents])).toEqual([
      ["a", 160000],
      ["b", 620000],
    ]);
    expect(creditSummary(entries, "2026-10-03")).toEqual({
      balanceCents: 780000,
      overdueCents: 160000,
      oldestDebtDays: 31,
    });
  });

  it("un pago de más deja saldo a favor", () => {
    const { open, creditCents } = openCharges([
      { id: "a", amountCents: 100000, date: "2026-09-01" },
      { id: "p", amountCents: -150000, date: "2026-09-02" },
    ]);
    expect(open).toEqual([]);
    expect(creditCents).toBe(50000);
    expect(creditSummary([], "2026-10-03").oldestDebtDays).toBeNull();
  });
});
