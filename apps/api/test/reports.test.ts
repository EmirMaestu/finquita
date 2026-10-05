import { daysInMonth, newId, todayAR } from "@mostrador/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { op, openShift, saleOf } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb({ today: todayAR() });
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });
type Row = Record<string, string | number | null>;
const today = todayAR();
const month = {
  from: `${today.slice(0, 7)}-01`,
  to: `${today.slice(0, 7)}-${String(daysInMonth(today)).padStart(2, "0")}`,
};
const q = `preset=custom&from=${month.from}&to=${month.to}`;

/** Coca ×2 en efectivo, yerba con débito (comisión 0,8 %) y fideos ×3 en efectivo, más un gasto de $ 4.500. */
async function scenario() {
  const tomas = await as(app(), ref.t.db, "tomas");
  const shift = newId();
  const r = await tomas.post("/api/sync/push", {
    deviceNow: new Date().toISOString(),
    ops: [
      openShift(shift),
      op("sale.create", saleOf(shift, [{ key: "coca", qty: 2 }], {}, 8001)),
      op("sale.create", saleOf(shift, [{ key: "yerba" }], { method: "debit" }, 8002)),
      op("sale.create", saleOf(shift, [{ key: "fideos", qty: 3 }], {}, 8003)),
      op(
        "cash.movement",
        {
          id: newId(),
          shiftId: shift,
          kind: "expense",
          amountCents: 450_000,
          reason: "Artículos de limpieza",
          category: "cleaning",
        },
        { by: "carlos" },
      ),
    ],
  });
  expect(r.body.results.every((x: { status: string }) => x.status === "applied")).toBe(true);
}

describe("reportes", () => {
  it("rentabilidad: margen por producto y total, con comisiones", async () => {
    await scenario();
    const carlos = await as(app(), ref.t.db, "carlos");
    const r = (await carlos.get(`/api/reports/profitability?${q}`)).body;
    // Vendido $ 21.800; costo $ 15.350; margen $ 6.450 (29,59 %).
    expect(r.headline).toMatchObject({ label: "Margen bruto", value: 645_000 });
    const stat = (l: string) => r.stats.find((s: { label: string }) => s.label === l)?.value;
    expect(stat("Margen %")).toBe(2959);
    expect(stat("Comisiones de medios de pago")).toBe(5_520);
    expect(stat("Margen después de comisiones")).toBe(645_000 - 5_520);
    const products = r.tables.find((t: { key: string }) => t.key === "products").rows as Row[];
    expect(products.find((p) => p.name === "Coca-Cola 2,25 L")).toEqual({
      name: "Coca-Cola 2,25 L",
      revenue: 920_000,
      cost: 660_000,
      margin: 260_000,
      marginPct: 2826,
    });
    expect(products.map((p) => p.name)).toEqual([
      "Coca-Cola 2,25 L",
      "Yerba Playadito 1 kg",
      "Fideos tirabuzón 500 g",
    ]);
    // Cigarrillos: precio fijo con 13 % de ganancia, debajo del mínimo de 20 %.
    const review = r.tables.find((t: { key: string }) => t.key === "review").rows as Row[];
    expect(review.find((p) => p.name === "Cigarrillos atado x 20")).toMatchObject({
      status: "Debajo del mínimo",
    });
  });

  it("resultado del mes: ventas − costo − comisiones − gastos de caja − fijos", async () => {
    await scenario();
    const carlos = await as(app(), ref.t.db, "carlos");
    await carlos.post("/api/fixed-expenses", {
      name: "Alquiler",
      category: "rent",
      monthlyCents: 150_000,
    });
    const r = (await carlos.get(`/api/reports/result?${q}`)).body;
    const result = 2_180_000 - 1_535_000 - 5_520 - 450_000 - 150_000;
    expect(r.headline).toMatchObject({ label: "Ganancia", value: result });
    const rows = r.tables[0].rows as Row[];
    expect(rows.map((x) => [x.name, x.cents])).toEqual([
      ["Ventas", 2_180_000],
      ["Costo de lo vendido", -1_535_000],
      ["Comisiones de medios de pago", -5_520],
      ["Gastos de caja", -450_000],
      ["Alquiler", -150_000],
      ["Resultado", result],
    ]);
  });

  it("ventas, fiado y permisos", async () => {
    await scenario();
    const carlos = await as(app(), ref.t.db, "carlos");
    const s = (await carlos.get(`/api/reports/sales?${q}`)).body;
    expect(s.headline.value).toBe(2_180_000);
    expect(s.stats[0]).toMatchObject({ label: "Tickets", value: 3 });
    expect(
      (s.tables.find((t: { key: string }) => t.key === "methods").rows as Row[]).map((m) => [
        m.name,
        m.total,
      ]),
    ).toEqual([
      ["Efectivo", 1_490_000],
      ["Débito", 690_000],
    ]);
    const credit = (await carlos.get("/api/reports/credit")).body;
    expect(credit.headline.value).toBe(7_380_000);
    // Antigüedad: Rosa, la compra nueva de Ortiz y Marta en 0 a 30; El Tano, Sergio y lo viejo de Ortiz en 31 a 60.
    expect((credit.tables[0].rows as Row[]).map((r) => r.cents)).toEqual([2_700_000, 4_680_000, 0]);
    // El encargado no ve rentabilidad; el cajero ve solo sus ventas; el repositor, nada.
    const julian = await as(app(), ref.t.db, "julian");
    expect((await julian.get(`/api/reports/profitability?${q}`)).status).toBe(403);
    expect((await julian.get(`/api/reports/cash?${q}`)).status).toBe(200);
    const tomas = await as(app(), ref.t.db, "tomas");
    expect((await tomas.get(`/api/reports/sales?${q}`)).body.headline.value).toBe(2_180_000);
    expect((await tomas.get(`/api/reports/stock?${q}`)).status).toBe(403);
    const nico = await as(app(), ref.t.db, "nico");
    expect((await nico.get(`/api/reports/sales?${q}`)).status).toBe(403);
  });
});
