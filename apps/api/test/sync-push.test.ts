import { newId } from "@mostrador/shared";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { alerts, cashMovements, products, sales, syncOps } from "../src/db/schema/index";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { op, openShift, product, saleOf } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });
const now = () => new Date().toISOString();

async function stockOf(key: string) {
  const [p] = await ref.t.db
    .select()
    .from(products)
    .where(eq(products.id, product(key)));
  return p?.stockQty;
}

describe("POST /api/sync/push", () => {
  it("aplica la cola en orden y responde por operación", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const shiftId = newId();
    const sale = saleOf(shiftId, [{ key: "coca" }, { key: "pan", qty: 0.75 }], {
      tendered: 2_000_000,
    });
    const r = await mac.post("/api/sync/push", {
      deviceNow: now(),
      ops: [
        openShift(shiftId),
        op(
          "cash.movement",
          {
            id: newId(),
            shiftId,
            kind: "income",
            amountCents: 500_000,
            reason: "Cambio del dueño",
          },
          { by: "julian" },
        ),
        op("sale.create", sale),
      ],
    });
    expect(r.status).toBe(200);
    expect(r.body.results.map((x: { status: string }) => x.status)).toEqual([
      "applied",
      "applied",
      "applied",
    ]);
    expect(r.body.results[2].result).toMatchObject({ saleId: sale.id, number: 4187 });
    expect(await stockOf("coca")).toBe(13);
    expect(await stockOf("pan")).toBe(5.65);
    const cash = await ref.t.db
      .select()
      .from(cashMovements)
      .where(eq(cashMovements.shiftId, shiftId));
    // Ingreso + venta en efectivo neta del vuelto ($ 4.600 + $ 2.850).
    expect(cash.map((m) => m.amountCents).sort()).toEqual([500_000, 745_000].sort());
  });

  it("una operación duplicada no se aplica dos veces", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const shiftId = newId();
    const open = openShift(shiftId);
    const sale = op("sale.create", saleOf(shiftId, [{ key: "yerba" }]));
    const first = await mac.post("/api/sync/push", { deviceNow: now(), ops: [open, sale] });
    expect(first.body.results.map((x: { status: string }) => x.status)).toEqual([
      "applied",
      "applied",
    ]);
    // Se corta la conexión antes de la respuesta y el dispositivo reenvía (incluso repetida en el lote).
    const again = await mac.post("/api/sync/push", { deviceNow: now(), ops: [open, sale, sale] });
    expect(again.body.results).toHaveLength(3);
    for (const res of again.body.results)
      expect(res).toMatchObject({ status: "applied", duplicate: true });
    expect(again.body.results[1].result.saleId).toBe(sale.payload.id);
    const rows = await ref.t.db.select().from(sales).where(eq(sales.id, sale.payload.id));
    expect(rows).toHaveLength(1);
    expect(await stockOf("yerba")).toBe(2);
  });

  it("respeta el orden: una venta antes de abrir la caja se rechaza", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const shiftId = newId();
    const r = await mac.post("/api/sync/push", {
      deviceNow: now(),
      ops: [
        op("sale.create", saleOf(shiftId, [{ key: "coca" }])),
        openShift(shiftId),
        op("sale.create", saleOf(shiftId, [{ key: "coca" }], {}, 4188)),
      ],
    });
    expect(r.body.results.map((x: { status: string }) => x.status)).toEqual([
      "rejected",
      "applied",
      "applied",
    ]);
    expect(r.body.results[0].reason).toContain("turno");
    expect(await stockOf("coca")).toBe(13);
  });

  it("lo rechazado queda guardado y va a Avisos; reenviarlo da el mismo rechazo", async () => {
    const nico = await as(app(), ref.t.db, "nico");
    const shiftId = newId();
    const julian = await as(app(), ref.t.db, "julian");
    await julian.post("/api/sync/push", {
      deviceNow: now(),
      ops: [openShift(shiftId, 2_000_000, "julian")],
    });
    const sale = op("sale.create", saleOf(shiftId, [{ key: "coca" }]), { by: "nico" });
    const r = await nico.post("/api/sync/push", { deviceNow: now(), ops: [sale] });
    expect(r.body.results[0]).toMatchObject({ opId: sale.opId, status: "rejected" });
    expect(r.body.results[0].reason).toContain("permiso");
    const [stored] = await ref.t.db.select().from(syncOps).where(eq(syncOps.opId, sale.opId));
    expect(stored).toMatchObject({ status: "rejected", type: "sale.create" });
    expect((stored?.payload as { id: string } | undefined)?.id).toBe(sale.payload.id);
    const [alert] = await ref.t.db
      .select()
      .from(alerts)
      .where(and(eq(alerts.kind, "sync_rejected"), eq(alerts.refId, sale.opId)));
    expect(alert?.title).toBe("No se pudo registrar una venta");
    const again = await nico.post("/api/sync/push", { deviceNow: now(), ops: [sale] });
    expect(again.body.results[0]).toMatchObject({ status: "rejected", duplicate: true });
    expect(await stockOf("coca")).toBe(14);
  });

  it("rechaza datos inválidos con el motivo", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const bad = op("sale.void", { saleId: newId(), reason: "" });
    const r = await mac.post("/api/sync/push", { deviceNow: now(), ops: [bad, { nada: true }] });
    expect(r.body.results[0]).toMatchObject({ opId: bad.opId, status: "rejected" });
    expect(r.body.results[0].reason).toContain("reason");
    expect(r.body.results[1]).toMatchObject({ opId: "", status: "rejected" });
  });

  it("una acción con PIN pasa con la autorización de un encargado", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const shiftId = newId();
    const expense = {
      id: newId(),
      shiftId,
      kind: "expense" as const,
      amountCents: 450_000,
      reason: "Artículos de limpieza",
      category: "cleaning" as const,
    };
    const r = await mac.post("/api/sync/push", {
      deviceNow: now(),
      ops: [
        openShift(shiftId),
        op("cash.movement", expense),
        op("cash.movement", { ...expense, id: newId() }, { authorizedBy: "julian" }),
      ],
    });
    expect(r.body.results.map((x: { status: string }) => x.status)).toEqual([
      "applied",
      "rejected",
      "applied",
    ]);
    expect(r.body.results[1].reason).toContain("PIN");
  });

  it("marca las ventas de un dispositivo con la hora corrida", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const shiftId = newId();
    const sale = op("sale.create", saleOf(shiftId, [{ key: "fideos" }]));
    const skewed = new Date(Date.now() + 20 * 60_000).toISOString();
    await mac.post("/api/sync/push", { deviceNow: skewed, ops: [openShift(shiftId), sale] });
    const [s] = await ref.t.db.select().from(sales).where(eq(sales.id, sale.payload.id));
    expect(s?.clockSkew).toBe(true);
  });

  it("lotes de hasta 100 operaciones y con sesión", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const ops = Array.from({ length: 101 }, () => openShift());
    expect((await mac.post("/api/sync/push", { deviceNow: now(), ops })).status).toBe(400);
    const anon = await app().request("/api/sync/push", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });
    expect(anon.status).toBe(401);
  });
});
