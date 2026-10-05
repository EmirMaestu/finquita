import { describe, expect, it } from "vitest";
import { costChange, receiptSummary } from "./receiving";

describe("recepción", () => {
  it("el costo subió 12 % y sugiere el precio con el margen", () => {
    const c = costChange({
      previousCostCents: 210_000,
      costCents: 235_000,
      priceCents: 300_000,
      marginBp: 4400,
      roundingCents: 5000,
    });
    expect(c).toMatchObject({ pct: 12, up: true, suggestedPriceCents: 340_000 });
    expect(c?.text).toBe("El costo subió 12 %: $ 2.100 → $ 2.350");
    expect(c?.priceText).toBe("Precio sugerido con tu 44 %: $ 3.400 (hoy $ 3.000)");
    expect(
      costChange({
        previousCostCents: 210_000,
        costCents: 210_000,
        priceCents: 1,
        marginBp: 1,
        roundingCents: 1,
      }),
    ).toBeNull();
    expect(
      costChange({
        previousCostCents: null,
        costCents: 210_000,
        priceCents: 1,
        marginBp: 1,
        roundingCents: 1,
      }),
    ).toBeNull();
    expect(
      costChange({
        previousCostCents: 200_000,
        costCents: 190_000,
        priceCents: 300_000,
        marginBp: 4000,
        roundingCents: 5000,
      })?.text,
    ).toBe("El costo bajó 5 %: $ 2.000 → $ 1.900");
  });

  it("resume faltantes, sobrantes y dañados antes de confirmar", () => {
    const s = receiptSummary([
      { name: "Leche entera 1 L sachet", ordered: 24, received: 24, damaged: 0 },
      { name: "Yogur bebible 1 L", ordered: 12, received: 10, damaged: 0 },
      { name: "Ricota 500 g", ordered: 4, received: 4, damaged: 1 },
      { name: "Manteca 200 g", ordered: 10, received: 12, damaged: 0 },
      { name: "Queso cremoso", ordered: null, received: 1.2, damaged: 0, unit: "kg" },
    ]);
    expect(s.lines).toEqual([
      "Faltan 2 u de Yogur bebible 1 L",
      "Dañados: 1 u de Ricota 500 g",
      "Sobran 2 u de Manteca 200 g",
      "Llegó sin pedir: 1,200 kg de Queso cremoso",
    ]);
    expect(
      receiptSummary([{ name: "x", ordered: 3, received: 3, damaged: 0 }]).hasDifferences,
    ).toBe(false);
  });
});
