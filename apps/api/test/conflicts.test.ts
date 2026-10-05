import { newId } from "@mostrador/shared";
import { and, desc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import {
  alerts,
  auditLog,
  barcodes,
  customers,
  products,
  saleLines,
  sales,
  shifts,
} from "../src/db/schema/index";
import { as } from "./helpers/actors";
import type { TestClient } from "./helpers/client";
import { TEST_AUTH } from "./helpers/client";
import { customer, op, openShift, product, REGISTER, saleOf } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });
const push = (c: TestClient, ops: unknown[]) =>
  c.post("/api/sync/push", { deviceNow: new Date().toISOString(), ops });
const statuses = (r: { body: { results: { status: string }[] } }) =>
  r.body.results.map((x) => x.status);

async function alertsOf(kind: string) {
  return ref.t.db
    .select()
    .from(alerts)
    .where(eq(alerts.kind, kind as never));
}

describe("conflictos de la venta sin conexión", () => {
  it("1. dos dispositivos venden la última unidad: se aceptan las dos, el stock queda negativo y avisa", async () => {
    await ref.t.db
      .update(products)
      .set({ stockQty: 1 })
      .where(eq(products.id, product("ricota")));
    const mac = await as(app(), ref.t.db, "tomas");
    const iphone = await as(app(), ref.t.db, "carlos", "iPhone de Carlos");
    const shiftId = newId();
    expect(statuses(await push(mac, [openShift(shiftId)]))).toEqual(["applied"]);
    // Las dos vendieron sin conexión la misma ricota; sincronizan después.
    const a = await push(mac, [op("sale.create", saleOf(shiftId, [{ key: "ricota" }], {}, 5001))]);
    const b = await push(iphone, [
      op("sale.create", saleOf(shiftId, [{ key: "ricota" }], {}, 5002), { by: "carlos" }),
    ]);
    expect([...statuses(a), ...statuses(b)]).toEqual(["applied", "applied"]);
    const [ricota] = await ref.t.db
      .select()
      .from(products)
      .where(eq(products.id, product("ricota")));
    expect(ricota?.stockQty).toBe(-1);
    const neg = await alertsOf("negative_stock");
    expect(neg).toHaveLength(1);
    expect(neg[0]).toMatchObject({ refId: product("ricota"), severity: "danger" });
  });

  it("2. el dueño cambia un precio con la Mac sin conexión: la venta queda con el precio viejo y el nuevo baja al reconectar", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const carlos = await as(app(), ref.t.db, "carlos", "iPhone de Carlos");
    const { body: first } = await mac.get("/api/sync/pull?since=0");
    // El dueño sube la yerba a $ 7.200 desde el iPhone.
    const up = await push(carlos, [
      op(
        "product.upsert",
        { id: product("yerba"), changes: { priceCents: 720_000 }, base: { priceCents: 690_000 } },
        { by: "carlos" },
      ),
    ]);
    expect(statuses(up)).toEqual(["applied"]);
    // La Mac, sin conexión, vendió a $ 6.900.
    const shiftId = newId();
    const sale = saleOf(shiftId, [{ key: "yerba" }]);
    expect(statuses(await push(mac, [openShift(shiftId), op("sale.create", sale)]))).toEqual([
      "applied",
      "applied",
    ]);
    const [line] = await ref.t.db.select().from(saleLines).where(eq(saleLines.saleId, sale.id));
    expect(line?.unitPriceCents).toBe(690_000);
    const [s] = await ref.t.db.select().from(sales).where(eq(sales.id, sale.id));
    expect(s?.totalCents).toBe(690_000);
    // Al reconectar, el precio nuevo baja.
    const { body } = await mac.get(`/api/sync/pull?since=${first.cursor}`);
    const yerba = body.changes.find((c: { id: string }) => c.id === product("yerba"));
    expect(yerba.data.priceCents).toBe(720_000);
  });

  it("3. el mismo producto se edita en dos dispositivos: gana el último, campo por campo, y queda en Actividad", async () => {
    const julian = await as(app(), ref.t.db, "julian");
    const carlos = await as(app(), ref.t.db, "carlos", "iPhone de Carlos");
    const base = { priceCents: 690_000, location: "Góndola 3", minStock: 8 };
    // Los dos partieron del mismo estado; Julián cambió precio y ubicación, Carlos precio y mínimo.
    await push(julian, [
      op(
        "product.upsert",
        { id: product("yerba"), changes: { priceCents: 700_000, location: "Góndola 4" }, base },
        { by: "julian" },
      ),
    ]);
    await push(carlos, [
      op(
        "product.upsert",
        { id: product("yerba"), changes: { priceCents: 720_000, minStock: 10 }, base },
        { by: "carlos" },
      ),
    ]);
    const [yerba] = await ref.t.db
      .select()
      .from(products)
      .where(eq(products.id, product("yerba")));
    expect(yerba).toMatchObject({ priceCents: 720_000, location: "Góndola 4", minStock: 10 });
    const log = await ref.t.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, "product"), eq(auditLog.entityId, product("yerba"))))
      .orderBy(desc(auditLog.createdAt));
    expect(log).toHaveLength(2);
    const last = log.find((l) => l.note);
    expect(last?.note).toContain("priceCents");
    expect(last?.before).toMatchObject({ priceCents: 700_000 });
    expect(last?.after).toMatchObject({ priceCents: 720_000 });
  });

  it("4. un fiado supera el límite sin conexión: la venta se acepta y el dueño recibe un aviso", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const shiftId = newId();
    // Rosa debe $ 18.400 con límite $ 30.000: una compra de $ 13.800 la pasa.
    const sale = saleOf(shiftId, [{ key: "yerba", qty: 2 }], {
      method: "account",
      customerId: customer("rosa"),
    });
    const r = await push(mac, [openShift(shiftId), op("sale.create", sale)]);
    expect(statuses(r)).toEqual(["applied", "applied"]);
    expect(r.body.results[1].result.credit).toMatchObject({
      overLimit: true,
      balanceAfter: 3_220_000,
    });
    const [rosa] = await ref.t.db
      .select()
      .from(customers)
      .where(eq(customers.id, customer("rosa")));
    expect(rosa?.balanceCents).toBe(3_220_000);
    const over = await alertsOf("credit_over_limit");
    expect(over).toHaveLength(1);
    expect(over[0]?.title).toContain("Rosa Giménez");
  });

  it("5. el mismo código se da de alta en dos dispositivos: queda en el primero y va a Avisos para unir", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const iphone = await as(app(), ref.t.db, "carlos", "iPhone de Carlos");
    const a = newId();
    const b = newId();
    const code = "7790895000782";
    await push(mac, [
      op("product.upsert", {
        id: a,
        changes: { name: "Galletitas de agua", priceCents: 150_000 },
        barcodes: [code],
      }),
    ]);
    const r = await push(iphone, [
      op(
        "product.upsert",
        {
          id: b,
          changes: { name: "Galletitas agua 200 g", priceCents: 160_000 },
          barcodes: [code],
        },
        { by: "carlos" },
      ),
    ]);
    expect(r.body.results[0]).toMatchObject({
      status: "applied",
      result: { duplicateBarcodes: [code] },
    });
    const owners = await ref.t.db.select().from(barcodes).where(eq(barcodes.code, code));
    expect(owners.map((o) => o.productId)).toEqual([a]);
    expect(await ref.t.db.select().from(products).where(eq(products.id, b))).toHaveLength(1);
    const dup = await alertsOf("duplicate_barcode");
    expect(dup).toHaveLength(1);
    expect(dup[0]?.data).toEqual({ code, productIds: [a, b] });
  });

  it("6. se cierra un turno sin conexión: el servidor lo recalcula y avisa si no coincide", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const julian = await as(app(), ref.t.db, "julian", "iPhone de Julián");
    const shiftId = newId();
    await push(mac, [openShift(shiftId)]);
    // La Mac vende en efectivo y, sin conexión, cierra con lo que sabe: $ 20.000 + $ 4.600.
    const sale = saleOf(shiftId, [{ key: "coca" }]);
    // Mientras tanto, Julián cobró un fiado en efectivo en esa caja desde su iPhone.
    await push(julian, [
      op(
        "credit.payment",
        {
          id: newId(),
          customerId: customer("rosa"),
          amountCents: 800_000,
          method: "cash",
          shiftId,
          applyTo: "oldest",
        },
        { by: "julian" },
      ),
    ]);
    const close = await push(mac, [
      op("sale.create", sale),
      op("cash.shift_close", {
        shiftId,
        countedCashCents: 2_460_000,
        expectedCashCents: 2_460_000,
        differenceCents: 0,
        leftFloatCents: 2_000_000,
        withdrawnCents: 460_000,
      }),
    ]);
    expect(statuses(close)).toEqual(["applied", "applied"]);
    expect(close.body.results[1].result).toEqual({
      expectedCashCents: 3_260_000,
      differenceCents: -800_000,
      mismatchCents: 800_000,
    });
    const [s] = await ref.t.db.select().from(shifts).where(eq(shifts.id, shiftId));
    expect(s).toMatchObject({
      status: "closed",
      expectedCashCents: 3_260_000,
      serverMismatchCents: 800_000,
      registerId: REGISTER,
    });
    const mismatch = await alertsOf("shift_mismatch");
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0]?.data).toEqual({ device: 2_460_000, server: 3_260_000 });
  });
});
