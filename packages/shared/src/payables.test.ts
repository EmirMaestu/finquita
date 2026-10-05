import { describe, expect, it } from "vitest";
import { listCost, type Payable, payableState, payablesSummary } from "./payables";

const TODAY = "2026-10-05";
const inv = (p: Partial<Payable>): Payable => ({
  supplierId: "lacteos",
  kind: "invoice",
  dueOn: "2026-10-06",
  amountCents: 18_450_000,
  paidCents: 0,
  ...p,
});

describe("cuentas a pagar", () => {
  it("estado: pendiente, vencida, pagada parcial y pagada", () => {
    expect(payableState(inv({}), TODAY)).toBe("pending");
    expect(payableState(inv({ dueOn: "2026-10-01" }), TODAY)).toBe("overdue");
    expect(payableState(inv({ paidCents: 10_000_000 }), TODAY)).toBe("partial");
    expect(payableState(inv({ paidCents: 18_450_000, dueOn: "2026-10-01" }), TODAY)).toBe("paid");
    expect(payableState(inv({ kind: "credit_note", amountCents: -460_000 }), TODAY)).toBe(
      "pending",
    );
  });

  it("saldo por proveedor con notas de crédito, y la agenda de la semana", () => {
    const s = payablesSummary(
      [
        inv({}),
        inv({ supplierId: "andina", amountCents: 9_630_000, dueOn: "2026-10-10" }),
        inv({ supplierId: "limpieza", amountCents: 2_280_000, dueOn: "2026-10-02" }),
        inv({ supplierId: "andina", kind: "credit_note", amountCents: -460_000, dueOn: null }),
        inv({ supplierId: "pan", amountCents: 4_100_000, dueOn: "2026-10-20" }),
        inv({ supplierId: "lacteos", amountCents: 1_000_000, paidCents: 1_000_000 }),
      ],
      TODAY,
    );
    expect(s.bySupplier).toEqual({
      lacteos: 18_450_000,
      andina: 9_170_000,
      limpieza: 2_280_000,
      pan: 4_100_000,
    });
    expect(s).toMatchObject({
      dueThisWeekCents: 18_450_000 + 9_630_000,
      overdueCents: 2_280_000,
      creditNotesCents: 460_000,
      totalCents: 34_000_000,
    });
  });

  it("lista de precios: con o sin IVA y con bonificación", () => {
    expect(listCost(1_000_000, { vatIncluded: false, vatBp: 2100, discountBp: 1000 })).toBe(
      1_089_000,
    );
    expect(listCost(1_000_000, { vatIncluded: true, vatBp: 2100, discountBp: 0 })).toBe(1_000_000);
    expect(listCost(235_000, { vatIncluded: true, vatBp: 2100, discountBp: 500 })).toBe(223_250);
  });
});
