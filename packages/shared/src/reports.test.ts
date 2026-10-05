import { describe, expect, it } from "vitest";
import { agingBucket, fixedInRange, periodRange, previousRange } from "./reports";

describe("períodos de los reportes", () => {
  it("presets y período anterior", () => {
    expect(periodRange("today", "2026-10-05")).toEqual({ from: "2026-10-05", to: "2026-10-05" });
    expect(periodRange("7d", "2026-10-05")).toEqual({ from: "2026-09-29", to: "2026-10-05" });
    expect(periodRange("month", "2026-10-05")).toEqual({ from: "2026-10-01", to: "2026-10-05" });
    expect(periodRange("last_month", "2026-10-05")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(previousRange({ from: "2026-10-05", to: "2026-10-05" })).toEqual({
      from: "2026-10-04",
      to: "2026-10-04",
    });
    expect(previousRange({ from: "2026-09-29", to: "2026-10-05" })).toEqual({
      from: "2026-09-22",
      to: "2026-09-28",
    });
    // Del 1 al 5 de octubre contra del 1 al 5 de septiembre; un mes entero contra el anterior entero.
    expect(previousRange({ from: "2026-10-01", to: "2026-10-05" })).toEqual({
      from: "2026-09-01",
      to: "2026-09-05",
    });
    expect(previousRange({ from: "2026-10-01", to: "2026-10-31" })).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("gastos fijos prorrateados y antigüedad del fiado", () => {
    expect(fixedInRange(30_000_000, { from: "2026-09-01", to: "2026-09-30" })).toBe(30_000_000);
    expect(fixedInRange(31_000_000, { from: "2026-10-01", to: "2026-10-05" })).toBe(5_000_000);
    expect([agingBucket(12), agingBucket(38), agingBucket(61)]).toEqual(["0-30", "31-60", "60+"]);
  });
});
