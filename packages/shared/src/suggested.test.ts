import { describe, expect, it } from "vitest";
import { deliveryWindow, explainSuggestion, packPlural, suggestQty } from "./suggested";

describe("pedido sugerido", () => {
  it("3 por día, 11 días a cubrir y stock 9: pedí 24, 2 cajas de 12", () => {
    const input = { dailySales: 3, daysToCover: 11, stock: 9, onOrder: 0, packQty: 12 };
    const s = suggestQty(input);
    expect(s).toEqual({ need: 33, qty: 24, packs: 2, reason: "sales" });
    expect(explainSuggestion(input, s)).toBe(
      "Vendés 3 por día · tiene que alcanzar 11 días · necesitás 33 · tenés 9 → pedí 24, 2 cajas de 12",
    );
  });

  it("días a cubrir: pedido martes 6/10, entrega jueves 8/10, el siguiente llega el 15/10, más 2 de reserva = 11", () => {
    expect(deliveryWindow("2026-10-06", [4], 2)).toEqual({
      delivery: "2026-10-08",
      following: "2026-10-15",
      daysToCover: 11,
    });
    // Reparto diario: llega mañana y el siguiente pasado mañana.
    expect(deliveryWindow("2026-10-06", [0, 1, 2, 3, 4, 5, 6], 0).daysToCover).toBe(2);
    // Sin días fijos: llega en el plazo y se repite cada semana.
    expect(deliveryWindow("2026-10-06", [], 2, 2)).toEqual({
      delivery: "2026-10-08",
      following: "2026-10-15",
      daysToCover: 11,
    });
  });

  it("descuenta lo ya pedido y redondea al bulto", () => {
    expect(
      suggestQty({ dailySales: 3, daysToCover: 11, stock: 9, onOrder: 12, packQty: 12 }),
    ).toMatchObject({ qty: 12, packs: 1 });
    expect(
      suggestQty({ dailySales: 3, daysToCover: 11, stock: 40, onOrder: 0, packQty: 12 }),
    ).toMatchObject({ qty: 0 });
    // Stock negativo cuenta como cero y no pisa la cuenta por ventas con la del mínimo.
    expect(
      suggestQty({
        dailySales: 3,
        daysToCover: 12,
        stock: -80,
        onOrder: 0,
        minStock: 8,
        packQty: 6,
      }),
    ).toMatchObject({ qty: 36, reason: "sales" });
  });

  it("debajo del mínimo sin ventas: completa el mínimo; faltante anotado: al menos un bulto", () => {
    const s = suggestQty({
      dailySales: 0,
      daysToCover: 11,
      stock: 0,
      onOrder: 0,
      minStock: 6,
      packQty: 12,
    });
    expect(s).toMatchObject({ qty: 12, packs: 1, reason: "minimum" });
    expect(
      suggestQty({ dailySales: 0, daysToCover: 11, stock: 3, onOrder: 0, shortage: true }),
    ).toMatchObject({ qty: 1, reason: "shortage" });
  });

  it("explica el mínimo sin ventas y pluraliza el bulto", () => {
    const input = {
      dailySales: 0,
      daysToCover: 12,
      stock: 0,
      onOrder: 0,
      minStock: 24,
      packQty: 12,
    };
    expect(explainSuggestion(input, suggestQty(input), "Cajón")).toBe(
      "No tuvo ventas en los últimos 28 días · tenés 0 → pedí 24, 2 cajones de 12 para llegar al mínimo de 24",
    );
    expect(packPlural("pack")).toBe("packs");
    expect(packPlural("display")).toBe("displays");
    expect(packPlural("bulto")).toBe("bultos");
  });

  it("pesables: en kilos con 3 decimales", () => {
    const input = { dailySales: 0.45, daysToCover: 3, stock: 0.8, onOrder: 0, unit: "kg" as const };
    expect(suggestQty(input)).toMatchObject({ need: 1.35, qty: 0.55 });
    expect(explainSuggestion(input, suggestQty(input))).toBe(
      "Vendés 0,450 kg por día · tiene que alcanzar 3 días · necesitás 1,350 kg · tenés 0,800 kg → pedí 0,550 kg",
    );
  });
});
