import { DEFAULT_PRICING, deliveryWindow, newId, suggestQty, todayAR } from "@mostrador/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { seedId } from "../src/seed/ids";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { op, openShift, saleOf } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });
const LACTEOS = seedId("supplier:lacteos");
type Line = {
  name: string;
  suggested: number;
  packs: number | null;
  reason: string;
  dailySales: number;
  explanation: string;
  costCents?: number;
};

describe("pedido sugerido", () => {
  it("Lácteos del Sur: 14 productos debajo del mínimo, la leche en 2 cajones de 12", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const all = await carlos.get("/api/purchasing/suggested");
    expect(
      all.body.find((o: { supplierName: string }) => o.supplierName === "Lácteos del Sur"),
    ).toMatchObject({ count: 14, minOrderCents: 15_000_000 });
    const r = await carlos.get(`/api/purchasing/suggested?supplierId=${LACTEOS}`);
    const [order] = r.body;
    expect(order.delivery).toBe(
      deliveryWindow(todayAR(), [4], DEFAULT_PRICING.reserveDays).delivery,
    );
    const leche = order.lines.find((l: Line) => l.name === "Leche entera 1 L sachet");
    expect(leche).toMatchObject({ suggested: 24, packs: 2, reason: "minimum", costCents: 135_000 });
    expect(leche.explanation).toBe(
      "No tuvo ventas en los últimos 28 días · tenés 0 → pedí 24, 2 cajones de 12 para llegar al mínimo de 24",
    );
  });

  it("usa la venta diaria de los últimos 28 días", async () => {
    const tomas = await as(app(), ref.t.db, "tomas");
    const shiftId = newId();
    const at = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const push = await tomas.post("/api/sync/push", {
      deviceNow: new Date().toISOString(),
      ops: [
        openShift(shiftId),
        op("sale.create", saleOf(shiftId, [{ key: "yogur", qty: 84 }], {}, 950), { at }),
      ],
    });
    expect(push.body.results.map((x: { status: string }) => x.status)).toEqual([
      "applied",
      "applied",
    ]);
    const carlos = await as(app(), ref.t.db, "carlos");
    const r = await carlos.get(`/api/purchasing/suggested?supplierId=${LACTEOS}`);
    const yogur = r.body[0].lines.find((l: Line) => l.name === "Yogur bebible 1 L");
    const days = r.body[0].daysToCover;
    const expected = suggestQty({
      dailySales: 3,
      daysToCover: days,
      stock: 0,
      onOrder: 0,
      minStock: 8,
      packQty: 6,
    });
    expect(yogur).toMatchObject({ dailySales: 3, suggested: expected.qty, reason: "sales" });
    expect(yogur.explanation).toContain(
      `Vendés 3 por día · tiene que alcanzar ${days} días · necesitás ${3 * days} · tenés 0 → pedí ${expected.qty}`,
    );
  });

  it("el encargado lo arma sin costos; el cajero no", async () => {
    const julian = await as(app(), ref.t.db, "julian");
    const r = await julian.get(`/api/purchasing/suggested?supplierId=${LACTEOS}`);
    expect(r.body[0].lines[0].costCents).toBeUndefined();
    expect(r.body[0].totalCents).toBeUndefined();
    const tomas = await as(app(), ref.t.db, "tomas");
    expect((await tomas.get("/api/purchasing/suggested")).status).toBe(403);
  });
});
