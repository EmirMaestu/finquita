import { describe, expect, it } from "vitest";
import { canComplete, checkoutState, creditNeedsPin, makeTender } from "./checkout";

describe("cobro", () => {
  it("flujo 1: billete de $ 20.000 para $ 18.550, vuelto $ 1.450", () => {
    const t = makeTender({ method: "cash", remainingCents: 1855000, typedCents: 2000000 });
    expect(t).toEqual({
      method: "cash",
      amountCents: 2000000,
      tenderedCents: 2000000,
      surchargeCents: 0,
    });
    const s = checkoutState(1855000, t ? [t] : []);
    expect(s).toMatchObject({ remainingCents: 0, changeCents: 145000 });
    expect(canComplete(1855000, t ? [t] : [])).toBe(true);
  });

  it("pago combinado: $ 10.000 en efectivo y el resto con débito", () => {
    const cash = makeTender({ method: "cash", remainingCents: 1855000, typedCents: 1000000 });
    const tenders = cash ? [cash] : [];
    const s1 = checkoutState(1855000, tenders);
    expect(s1.remainingCents).toBe(855000);
    const debit = makeTender({
      method: "debit",
      remainingCents: s1.remainingCents,
      typedCents: null,
    });
    if (debit) tenders.push(debit);
    expect(checkoutState(1855000, tenders)).toMatchObject({ remainingCents: 0, changeCents: 0 });
    expect(canComplete(1855000, tenders)).toBe(true);
  });

  it("crédito +10 % se suma como recargo", () => {
    const t = makeTender({
      method: "credit",
      remainingCents: 855000,
      typedCents: null,
      surchargeBp: 1000,
    });
    expect(t).toMatchObject({ amountCents: 940500, surchargeCents: 85500 });
    expect(checkoutState(855000, t ? [t] : [])).toMatchObject({
      dueCents: 940500,
      remainingCents: 0,
    });
  });

  it("con tarjeta no se cobra de más", () => {
    const t = makeTender({ method: "debit", remainingCents: 500000, typedCents: 900000 });
    expect(t?.amountCents).toBe(500000);
    expect(canComplete(500000, [{ method: "debit", amountCents: 600000 }])).toBe(false);
  });

  it("fiado sobre el límite o con deuda vencida pide PIN", () => {
    expect(
      creditNeedsPin({
        balanceCents: 1840000,
        limitCents: 3000000,
        overdueCents: 0,
        chargeCents: 670000,
      }),
    ).toBe(false);
    expect(
      creditNeedsPin({
        balanceCents: 1840000,
        limitCents: 3000000,
        overdueCents: 0,
        chargeCents: 1380000,
      }),
    ).toBe(true);
    expect(
      creditNeedsPin({
        balanceCents: 310000,
        limitCents: 1500000,
        overdueCents: 310000,
        chargeCents: 100,
      }),
    ).toBe(true);
  });
});
