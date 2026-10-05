import { describe, expect, it } from "vitest";
import { creditReceiptText, creditSummary, openCharges, statementText } from "./credit";

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

describe("textos para compartir", () => {
  it("recibo del pago de Rosa", () => {
    const at = new Date("2026-10-10T18:30:00-03:00");
    expect(
      creditReceiptText({
        businessName: "Almacén La Esquina",
        customerName: "Rosa Giménez",
        amountCents: 2_000_000,
        methodLabel: "Efectivo",
        at,
        balanceAfterCents: 510_000,
      }),
    ).toBe(
      "Almacén La Esquina · Recibo de pago\nRosa Giménez pagó $ 20.000 (efectivo) el 10/10/2026 18:30.\nSaldo pendiente: $ 5.100.",
    );
    expect(
      creditReceiptText({
        businessName: "X",
        customerName: "Y",
        amountCents: 1,
        methodLabel: "QR",
        at,
        balanceAfterCents: 0,
      }),
    ).toContain("Cuenta al día");
  });

  it("estado de cuenta corto", () => {
    expect(
      statementText({
        businessName: "Almacén La Esquina",
        customerName: "Rosa Giménez",
        asOf: "2026-10-10",
        balanceCents: 510_000,
        overdueCents: 0,
        open: [{ date: "2026-10-03", openCents: 510_000 }],
      }),
    ).toBe(
      "Hola Rosa, te paso tu cuenta en Almacén La Esquina al 10/10/2026:\n• Compra del 03/10: $ 5.100\nSaldo: $ 5.100.",
    );
  });
});
