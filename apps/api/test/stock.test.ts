import { newId } from "@mostrador/shared";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { alerts, products, stockMovements } from "../src/db/schema/index";
import { as } from "./helpers/actors";
import type { TestClient } from "./helpers/client";
import { TEST_AUTH } from "./helpers/client";
import { op, openShift, product, saleOf } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });
const push = (c: TestClient, ops: unknown[]) =>
  c.post("/api/sync/push", { deviceNow: new Date().toISOString(), ops });
const stockOf = async (key: string) =>
  (
    await ref.t.db
      .select()
      .from(products)
      .where(eq(products.id, product(key)))
  )[0]?.stockQty;

describe("libro de movimientos de stock", () => {
  it("el stock es la suma de sus movimientos, con el resultante en cada uno", async () => {
    const tomas = await as(app(), ref.t.db, "tomas");
    const julian = await as(app(), ref.t.db, "julian");
    const shiftId = newId();
    await push(tomas, [
      openShift(shiftId),
      op("sale.create", saleOf(shiftId, [{ key: "coca", qty: 2 }])),
    ]);
    expect(
      (
        await julian.post("/api/stock/adjustments", {
          productId: product("coca"),
          qty: -1,
          reason: "breakage",
          note: "Se cayó",
        })
      ).status,
    ).toBe(201);
    // Ajuste al stock real contado.
    const real = await julian.post("/api/stock/adjustments", {
      productId: product("coca"),
      realQty: 10,
      reason: "missing",
    });
    expect(real.body).toMatchObject({ qty: -1, pending: false });
    const moves = await ref.t.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, product("coca")))
      .orderBy(asc(stockMovements.createdAt));
    expect(moves.map((m) => [m.kind, m.qty, m.resultingQty])).toEqual([
      ["adjustment", 14, 14],
      ["sale", -2, 12],
      ["waste", -1, 11],
      ["adjustment", -1, 10],
    ]);
    expect(moves.reduce((s, m) => s + m.qty, 0)).toBe(await stockOf("coca"));
    const api = await julian.get(`/api/stock/movements?productId=${product("coca")}`);
    expect(api.body[0]).toMatchObject({
      kind: "adjustment",
      qty: -1,
      resultingQty: 10,
      memberName: "Julián",
      reason: "missing",
    });
    // El encargado no ve costos: el valor no viaja.
    expect(api.body[0].valueCents).toBeUndefined();
    const carlos = await as(app(), ref.t.db, "carlos");
    expect(
      (await carlos.get(`/api/stock/movements?productId=${product("coca")}`)).body[0].valueCents,
    ).toBe(-330_000);
  });
});

describe("aprobación de ajustes", () => {
  it("lo que carga el repositor queda pendiente hasta que lo aprueban", async () => {
    const nico = await as(app(), ref.t.db, "nico");
    const julian = await as(app(), ref.t.db, "julian");
    const r = await nico.post("/api/stock/adjustments", {
      productId: product("yerba"),
      qty: -2,
      reason: "expired",
    });
    expect(r.body).toMatchObject({ pending: true, qty: -2 });
    expect(await stockOf("yerba")).toBe(3);
    const [alert] = await ref.t.db
      .select()
      .from(alerts)
      .where(eq(alerts.dedupeKey, "adjustment_pending"));
    expect(alert?.status).toBe("open");
    // El repositor no puede aprobarse a sí mismo.
    const pending = await julian.get("/api/stock/pending");
    expect(pending.body).toHaveLength(1);
    expect(pending.body[0]).toMatchObject({
      productName: "Yerba Playadito 1 kg",
      qty: -2,
      memberName: "Nico",
    });
    expect(
      (await nico.post(`/api/stock/movements/${pending.body[0].id}/review`, { approve: true }))
        .status,
    ).toBe(403);
    const ok = await julian.post(`/api/stock/movements/${pending.body[0].id}/review`, {
      approve: true,
    });
    expect(ok.body).toEqual({ status: "applied", resultingQty: 1 });
    expect(await stockOf("yerba")).toBe(1);
    const [after] = await ref.t.db
      .select()
      .from(alerts)
      .where(eq(alerts.dedupeKey, "adjustment_pending"));
    expect(after?.status).toBe("resolved");
    // No se revisa dos veces.
    expect(
      (await julian.post(`/api/stock/movements/${pending.body[0].id}/review`, { approve: false }))
        .status,
    ).toBe(400);
  });

  it("un ajuste rechazado no mueve el stock", async () => {
    const nico = await as(app(), ref.t.db, "nico");
    const carlos = await as(app(), ref.t.db, "carlos");
    await nico.post("/api/stock/adjustments", {
      productId: product("fideos"),
      qty: -5,
      reason: "missing",
    });
    const [p] = (await carlos.get("/api/stock/pending")).body;
    const r = await carlos.post(`/api/stock/movements/${p.id}/review`, { approve: false });
    expect(r.body.status).toBe("rejected");
    expect(await stockOf("fideos")).toBe(22);
    const [m] = await ref.t.db.select().from(stockMovements).where(eq(stockMovements.id, p.id));
    expect(m).toMatchObject({ status: "rejected", resultingQty: null });
  });

  it("el cajero no ajusta stock", async () => {
    const tomas = await as(app(), ref.t.db, "tomas");
    expect(
      (
        await tomas.post("/api/stock/adjustments", {
          productId: product("yerba"),
          qty: -1,
          reason: "waste",
        })
      ).status,
    ).toBe(403);
  });
});
