import { describe, expect, it } from "vitest";
import { bulkPreview, bulkSummary } from "./bulkprice";

const yerba = {
  id: "y",
  name: "Yerba",
  priceCents: 690000,
  costCents: 485000,
  marginBp: 4227,
  fixedPrice: false,
};
const cig = {
  id: "c",
  name: "Cigarrillos",
  priceCents: 470000,
  costCents: 415000,
  marginBp: 1325,
  fixedPrice: true,
};

describe("cambio masivo de precios", () => {
  it("+7 % al precio, redondeado a $ 50; el de precio fijo queda afuera", () => {
    const rows = bulkPreview([yerba, cig], {
      mode: "price_pct",
      percentBp: 700,
      roundingCents: 5000,
    });
    expect(rows[0]).toMatchObject({ beforeCents: 690000, afterCents: 740000, skipped: null });
    expect(rows[1]).toMatchObject({ afterCents: 470000, skipped: "Precio fijo" });
    expect(bulkSummary(rows)).toEqual({ changed: 1, skipped: 1, avgChangeBp: 725 });
  });

  it("+7 % al costo recalcula el precio con su ganancia", () => {
    const [r] = bulkPreview([yerba], { mode: "cost_pct", percentBp: 700, roundingCents: 5000 });
    expect(r).toMatchObject({ costAfterCents: 518950, afterCents: 740000 });
  });

  it("recalcular desde el costo; sin costo no se toca", () => {
    const rows = bulkPreview(
      [
        { ...yerba, marginBp: 4200 },
        { ...yerba, id: "z", costCents: null },
      ],
      { mode: "recalc", roundingCents: 5000 },
    );
    expect(rows[0]?.afterCents).toBe(690000);
    expect(rows[1]?.skipped).toBe("Sin costo");
  });
});
