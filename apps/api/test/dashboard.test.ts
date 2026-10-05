import { newId, todayAR } from "@mostrador/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { attention } from "../src/domain/dashboard";
import { seedId } from "../src/seed/ids";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { op, openShift, saleOf } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

// El panel mira "hoy": el escenario se carga con la fecha de hoy.
const ref = useSeededDb({ today: todayAR() });
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });
type Att = { key: string; text: string; action: string; path: string; severity: string };

async function sell() {
  const tomas = await as(app(), ref.t.db, "tomas");
  const now = new Date().toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const old = newId();
  const shift = newId();
  const r = await tomas.post("/api/sync/push", {
    deviceNow: now,
    ops: [
      // La semana pasada, el mismo día: una yerba ($ 6.900).
      openShift(old, 2_000_000, "tomas", weekAgo),
      op("sale.create", saleOf(old, [{ key: "yerba" }], {}, 7001), { at: weekAgo }),
      op(
        "cash.shift_close",
        {
          shiftId: old,
          countedCashCents: 2_690_000,
          expectedCashCents: 2_690_000,
          differenceCents: 0,
          leftFloatCents: 2_000_000,
          withdrawnCents: 690_000,
        },
        { at: weekAgo },
      ),
      // Hoy: tres ventas.
      openShift(shift),
      op("sale.create", saleOf(shift, [{ key: "coca", qty: 2 }], { tendered: 1_000_000 }, 7002)),
      op("sale.create", saleOf(shift, [{ key: "yerba" }], { method: "debit" }, 7003)),
      op("sale.create", saleOf(shift, [{ key: "fideos", qty: 3 }], { method: "qr" }, 7004)),
    ],
  });
  expect(r.body.results.every((x: { status: string }) => x.status === "applied")).toBe(true);
}

describe("panel del día", () => {
  it("números del día, medios de pago, margen, efectivo en caja y lo más vendido", async () => {
    await sell();
    const carlos = await as(app(), ref.t.db, "carlos");
    const d = (await carlos.get("/api/dashboard")).body;
    expect(d.numbers).toEqual({
      salesCents: 2_180_000,
      lastWeekSalesCents: 690_000,
      vsLastWeekBp: 21594,
      tickets: 3,
      averageTicketCents: 726_667,
      // Fondo de $ 20.000 + $ 9.200 en efectivo (pagó con $ 10.000, $ 800 de vuelto).
      cashCents: 2_920_000,
      marginCents: 2 * 130_000 + 205_000 + 3 * 60_000,
      marginBp: 2959,
    });
    expect(d.methods).toEqual({ cash: 920_000, debit: 690_000, qr: 570_000 });
    expect(d.top.map((t: { name: string; qty: number }) => [t.name, t.qty])).toEqual([
      ["Coca-Cola 2,25 L", 2],
      ["Yerba Playadito 1 kg", 1],
      ["Fideos tirabuzón 500 g", 3],
    ]);
    const hours = d.byHour.filter((h: { todayCents: number }) => h.todayCents > 0);
    expect(hours.reduce((s: number, h: { todayCents: number }) => s + h.todayCents, 0)).toBe(
      2_180_000,
    );
    expect(d.byHour.reduce((s: number, h: { avgCents: number }) => s + h.avgCents, 0)).toBe(
      Math.round(690_000 / 4),
    );
  });

  it("Requiere atención: stock bajo, factura por vencer y fiado vencido, en orden de urgencia", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const items: Att[] = (await carlos.get("/api/dashboard")).body.attention;
    const texts = items.map((a) => a.text);
    expect(texts).toContain("Factura de Lácteos del Sur vence mañana, $ 184.500");
    expect(texts).toContain("3 clientes con fiado vencido, $ 46.800");
    expect(items.find((a) => a.key === "low_stock")).toMatchObject({
      action: "Armar pedidos",
      path: "/compras/sugerido",
    });
    expect(items.find((a) => a.key === "low_stock")?.text).toMatch(
      /^\d+ productos debajo del mínimo$/,
    );
    // Pasadas las 24 h, el pedido 0041 a Distribuidora Andina aparece para marcar la respuesta.
    const later = await attention(ref.t.db, {
      costs: true,
      now: new Date(Date.now() + 2 * 86_400_000),
    });
    expect(later.find((a) => a.key.startsWith("order:"))).toMatchObject({
      action: "Marcar respuesta",
      path: `/compras/pedidos/${seedId("order:0041")}`,
    });
    expect(later.find((a) => a.key.startsWith("order:"))?.text).toMatch(
      /^Pedido a Distribuidora Andina enviado hace \d+ h, sin confirmar$/,
    );
  });

  it("el encargado no ve el margen ni las facturas; el cajero no ve el panel", async () => {
    await sell();
    const julian = await as(app(), ref.t.db, "julian");
    const d = (await julian.get("/api/dashboard")).body;
    expect(d.numbers.salesCents).toBe(2_180_000);
    expect(d.numbers.marginCents).toBeUndefined();
    expect(d.attention.some((a: Att) => a.key.startsWith("invoice:"))).toBe(false);
    const tomas = await as(app(), ref.t.db, "tomas");
    expect((await tomas.get("/api/dashboard")).status).toBe(403);
  });

  it("repositor: tus tareas", async () => {
    const julian = await as(app(), ref.t.db, "julian");
    const count = await julian.post("/api/counts", {
      name: "Góndola 3, Infusiones",
      scope: "all",
      assignedTo: seedId("member:nico"),
    });
    await julian.post(`/api/orders/${seedId("order:0042")}/status`, { status: "sent" });
    await julian.patch(`/api/orders/${seedId("order:0042")}`, { expectedOn: todayAR() });
    const nico = await as(app(), ref.t.db, "nico");
    const t = (await nico.get("/api/dashboard/tasks")).body.tasks;
    expect(t.map((x: { text: string }) => x.text)).toEqual([
      "Contar Góndola 3, Infusiones",
      "Recibir el pedido 0042 de Lácteos del Sur",
      "Revisar vencimientos",
    ]);
    expect(t[0].path).toBe(`/productos/conteos/${count.body.id}`);
    expect(t[1].detail).toBe("llega hoy");
    // El jamón cocido del escenario vence en estos días.
    expect(t[2]).toMatchObject({
      detail: "1 lote vence en 7 días",
      path: "/productos/vencimientos",
    });
    expect((await nico.get("/api/dashboard")).status).toBe(403);
  });
});
