import { newId } from "@mostrador/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { alerts, pushSubscriptions } from "../src/db/schema/index";
import { dispatchPush, type PushMessage, runChecks } from "../src/domain/checks";
import { seedId } from "../src/seed/ids";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { op, openShift, product, saleOf } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });
type A = { kind: string; title: string; path: string; read: boolean; id: string; status: string };
const push = (by: Awaited<ReturnType<typeof as>>, ops: unknown[]) =>
  by.post("/api/sync/push", { deviceNow: new Date().toISOString(), ops });

describe("avisos", () => {
  it("stock bajo: avisa al cruzar el mínimo, sin repetir, y se resuelve al reponer", async () => {
    const tomas = await as(app(), ref.t.db, "tomas");
    const shiftId = newId();
    // Coca-Cola: 14 con mínimo 12; se venden 3 → quedan 11.
    await push(tomas, [
      openShift(shiftId),
      op("sale.create", saleOf(shiftId, [{ key: "coca", qty: 3 }], {}, 5001)),
    ]);
    await push(tomas, [op("sale.create", saleOf(shiftId, [{ key: "coca", qty: 1 }], {}, 5002))]);
    const carlos = await as(app(), ref.t.db, "carlos");
    const low = (await carlos.get("/api/alerts")).body.items.filter(
      (a: A) => a.kind === "low_stock",
    );
    expect(low).toHaveLength(1);
    expect(low[0]).toMatchObject({
      title: "Coca-Cola 2,25 L: quedan 11",
      path: `/productos/${product("coca")}`,
    });
    // El repositor también lo ve; el cajero no.
    expect(
      (await (await as(app(), ref.t.db, "nico")).get("/api/alerts")).body.items.some(
        (a: A) => a.kind === "low_stock",
      ),
    ).toBe(true);
    expect((await tomas.get("/api/alerts")).body.items.some((a: A) => a.kind === "low_stock")).toBe(
      false,
    );
    // Llegan 12: se resuelve solo.
    await push(carlos, [
      op(
        "receipt.confirm",
        {
          id: newId(),
          kind: "no_order",
          supplierId: seedId("supplier:andina"),
          lines: [{ id: newId(), productId: product("coca"), qty: 12, damagedQty: 0 }],
        },
        { by: "carlos" },
      ),
    ]);
    expect(
      (await carlos.get("/api/alerts")).body.items.some(
        (a: A) => a.kind === "low_stock" && a.title.startsWith("Coca"),
      ),
    ).toBe(false);
  });

  it("diferencia de caja al cerrar: le llega al dueño, no al cajero", async () => {
    const tomas = await as(app(), ref.t.db, "tomas");
    const shiftId = newId();
    await push(tomas, [
      openShift(shiftId),
      op("sale.create", saleOf(shiftId, [{ key: "yerba" }], { tendered: 690_000 }, 5003)),
      op("cash.shift_close", {
        shiftId,
        countedCashCents: 2_570_000,
        expectedCashCents: 2_690_000,
        differenceCents: -120_000,
        note: "Faltó cambio",
        leftFloatCents: 2_000_000,
        withdrawnCents: 570_000,
      }),
    ]);
    const carlos = await as(app(), ref.t.db, "carlos");
    const diff = (await carlos.get("/api/alerts")).body.items.find(
      (a: A) => a.kind === "cash_difference",
    );
    expect(diff?.title).toContain("−$ 1.200");
    expect(
      (await tomas.get("/api/alerts")).body.items.some((a: A) => a.kind === "cash_difference"),
    ).toBe(false);
  });

  it("pedido sin confirmar en 24 h: el chequeo programado avisa una sola vez", async () => {
    // El 0041 a Distribuidora Andina se mandó hace 26 h (escenario).
    const julian = await as(app(), ref.t.db, "julian");
    await julian.post(`/api/orders/${seedId("order:0042")}/status`, { status: "sent" });
    const r1 = await runChecks(ref.t.db, new Date("2026-10-03T19:00:00-03:00"));
    expect(r1.orderNoResponse).toBe(1);
    await runChecks(ref.t.db, new Date("2026-10-03T19:10:00-03:00"));
    const late = (await julian.get("/api/alerts")).body.items.filter(
      (a: A) => a.kind === "order_no_response",
    );
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({
      title: "Distribuidora Andina no confirmó el pedido 0041",
      path: `/compras/pedidos/${seedId("order:0041")}`,
    });
    // Confirmado a mano: el 0042 ya no entra aunque pase el día.
    await julian.post(`/api/orders/${seedId("order:0042")}/status`, { status: "confirmed" });
    expect((await runChecks(ref.t.db, new Date(Date.now() + 2 * 86_400_000))).orderNoResponse).toBe(
      1,
    );
  });

  it("factura por vencer, posponer, leído y resuelto", async () => {
    await runChecks(ref.t.db, new Date("2026-10-03T19:00:00-03:00"));
    const carlos = await as(app(), ref.t.db, "carlos");
    const list = await carlos.get("/api/alerts");
    const inv = list.body.items.find((a: A) => a.kind === "invoice_due");
    expect(inv?.title).toBe("Factura de Lácteos del Sur vence mañana, $ 184.500");
    const unread = list.body.unread;
    await carlos.post(`/api/alerts/${inv.id}/read`, {});
    expect((await carlos.get("/api/alerts/count")).body.unread).toBe(unread - 1);
    await carlos.post(`/api/alerts/${inv.id}/snooze`, { hours: 2 });
    expect((await carlos.get("/api/alerts")).body.items.some((a: A) => a.id === inv.id)).toBe(
      false,
    );
    expect((await runChecks(ref.t.db, new Date(Date.now() + 3 * 3_600_000))).unsnoozed).toBe(1);
    expect((await carlos.get("/api/alerts")).body.items.some((a: A) => a.id === inv.id)).toBe(true);
    await carlos.post(`/api/alerts/${inv.id}/resolve`, {});
    expect(
      (await carlos.get("/api/alerts?filter=all")).body.items.find((a: A) => a.id === inv.id)
        ?.status,
    ).toBe("resolved");
  });

  it("push: le llega a quien la matriz dice y se borra el navegador que ya no existe", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const julian = await as(app(), ref.t.db, "julian");
    await carlos.post("/api/push/subscriptions", {
      endpoint: "https://push.example/carlos",
      keys: { p256dh: "k1", auth: "a1" },
    });
    await carlos.post("/api/push/subscriptions", {
      endpoint: "https://push.example/carlos-viejo",
      keys: { p256dh: "k2", auth: "a2" },
    });
    await julian.post("/api/push/subscriptions", {
      endpoint: "https://push.example/julian",
      keys: { p256dh: "k3", auth: "a3" },
    });
    await ref.t.db.update(alerts).set({ pushedAt: new Date() });
    await runChecks(ref.t.db, new Date("2026-10-03T19:00:00-03:00"));
    const sent: { endpoint: string; msg: PushMessage }[] = [];
    const r = await dispatchPush(ref.t.db, async (sub, msg) => {
      if (sub.endpoint.endsWith("viejo")) return "gone";
      sent.push({ endpoint: sub.endpoint, msg });
      return "ok";
    });
    expect(r.alerts).toBeGreaterThan(0);
    // Pedido sin respuesta y factura por vencer: push solo al dueño.
    expect(new Set(sent.map((s) => s.endpoint))).toEqual(new Set(["https://push.example/carlos"]));
    expect(sent.map((s) => s.msg.title)).toContain(
      "Distribuidora Andina no confirmó el pedido 0041",
    );
    expect(
      await ref.t.db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, "https://push.example/carlos-viejo")),
    ).toHaveLength(0);
    // Ya salieron: no se repiten.
    expect((await dispatchPush(ref.t.db, async () => "ok")).alerts).toBe(0);
  });
});
