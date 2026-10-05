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

import { closeNotice, closeResult, signedMoney } from "./cash";

describe("arqueo y cierre", () => {
  it("con $ 120.700 contados la diferencia es −$ 1.200 y pide comentario", () => {
    const r = closeResult({
      expectedCashCents: 12_190_000,
      countedCashCents: 12_070_000,
      system: { debit: 5_640_000, credit: 1_120_000, qr: 4_910_000, transfer: 2_170_000 },
      counted: { debit: 5_640_000, credit: 1_120_000, qr: 4_910_000, transfer: 2_170_000 },
      toleranceCents: 50_000,
    });
    expect(r.cashDifferenceCents).toBe(-120_000);
    expect(r.overTolerance).toBe(true);
    expect(r.rows[0]).toMatchObject({ label: "Efectivo", differenceCents: -120_000 });
    expect(r.rows.slice(1).every((x) => x.differenceCents === 0)).toBe(true);
    expect(signedMoney(-120_000)).toBe("−$ 1.200");
    expect(signedMoney(30_000)).toBe("+$ 300");
  });

  it("dentro de la tolerancia no pide comentario", () => {
    expect(
      closeResult({
        expectedCashCents: 1_000_000,
        countedCashCents: 970_000,
        system: {},
        counted: {},
        toleranceCents: 50_000,
      }).overTolerance,
    ).toBe(false);
  });

  it("arma la notificación del cierre", () => {
    expect(
      closeNotice({
        shiftLabel: "turno tarde",
        cashier: "Tomás",
        salesCents: 23_680_000,
        countedCents: 12_070_000,
        differenceCents: -120_000,
      }),
    ).toBe(
      "Cierre turno tarde (Tomás): ventas $ 236.800, efectivo contado $ 120.700, diferencia −$ 1.200",
    );
  });
});
