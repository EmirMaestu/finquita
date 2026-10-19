import { describe, expect, it } from "vitest";
import { arDateTime } from "./dates";
import { closingLines, ticketLines } from "./ticket";

/** Venta 004187 del escenario (flujo 1). */
const example = {
  business: { name: "Almacén La Esquina", address: "San Martín 1234", city: "Godoy Cruz, Mendoza" },
  number: 4187,
  at: arDateTime("2026-10-03", "18:41"),
  cashier: "Tomás",
  lines: [
    {
      description: "Coca-Cola 2,25 L",
      qty: 1,
      unit: "unit" as const,
      unitPriceCents: 460000,
      totalCents: 460000,
    },
    {
      description: "Pan francés",
      qty: 0.75,
      unit: "kg" as const,
      unitPriceCents: 380000,
      totalCents: 285000,
    },
    {
      description: "Jamón cocido",
      qty: 0.2,
      unit: "kg" as const,
      unitPriceCents: 2100000,
      totalCents: 420000,
    },
    {
      description: "Yerba Playadito 1 kg",
      qty: 1,
      unit: "unit" as const,
      unitPriceCents: 690000,
      totalCents: 690000,
    },
  ],
  totalCents: 1855000,
  payments: [{ method: "cash" as const, amountCents: 2000000 }],
  changeCents: 145000,
};

describe("ticket", () => {
  it("58 mm: el ticket de ejemplo del spec", () => {
    const lines = ticketLines(example, 58);
    expect(lines.every((l) => l.length <= 32)).toBe(true);
    expect(lines.join("\n")).toMatchInlineSnapshot(`
      "       ALMACÉN LA ESQUINA
        San Martín 1234, Godoy Cruz
      --------------------------------
      Venta 004187    03/10/2026 18:41
      Cajero: Tomás
      --------------------------------
      Coca-Cola 2,25 L
        1 x $ 4.600            $ 4.600
      Pan francés
        0,750 kg x $ 3.800     $ 2.850
      Jamón cocido
        0,200 kg x $ 21.000    $ 4.200
      Yerba Playadito 1 kg
        1 x $ 6.900            $ 6.900
      --------------------------------
      TOTAL                   $ 18.550
      Efectivo                $ 20.000
      Vuelto                   $ 1.450
      --------------------------------
      Documento no válido como factura
          ¡Gracias por tu compra!"
    `);
  });

  it("los renglones de ítems y totales son idénticos a los del spec", () => {
    const spec = [
      "Venta 004187    03/10/2026 18:41",
      "  1 x $ 4.600            $ 4.600",
      "  0,750 kg x $ 3.800     $ 2.850",
      "  0,200 kg x $ 21.000    $ 4.200",
      "  1 x $ 6.900            $ 6.900",
      "TOTAL                   $ 18.550",
      "Efectivo                $ 20.000",
      "Vuelto                   $ 1.450",
      "Documento no válido como factura",
      "    ¡Gracias por tu compra!",
    ];
    const lines = ticketLines(example, 58);
    for (const s of spec) expect(lines).toContain(s);
  });

  it("80 mm usa 48 caracteres", () => {
    const lines = ticketLines(example, 80);
    expect(lines.every((l) => l.length <= 48)).toBe(true);
    expect(lines).toContain(`TOTAL${" ".repeat(48 - 5 - 8)}$ 18.550`);
  });
});

describe("comprobante de cierre", () => {
  const base = {
    business: { name: "Almacén La Esquina" },
    registerName: "Caja 1",
    shiftLabel: "turno tarde",
    cashier: "Carlos Díaz",
    openedAt: arDateTime("2026-10-03", "14:00"),
    closedAt: arDateTime("2026-10-03", "21:05"),
    lines: [{ label: "Fondo inicial", amountCents: 2000000 }],
    expectedCashCents: 2000000,
    countedCashCents: 2000000,
    differenceCents: 0,
    byMethod: [],
    salesCents: 0,
    leftFloatCents: 2000000,
    withdrawnCents: 0,
  };
  it("si cierra otra persona, lo dice: el turno es de quien lo abrió", () => {
    const lines = closingLines({ ...base, closedBy: "Tomás" }, 58);
    expect(lines).toContain("Cajero: Carlos Díaz");
    expect(lines).toContain("Cerró: Tomás");
  });
  it("si cierra quien abrió, no repite el nombre", () => {
    const lines = closingLines({ ...base, closedBy: "Carlos Díaz" }, 58);
    expect(lines.some((l) => l.startsWith("Cerró:"))).toBe(false);
  });
});
