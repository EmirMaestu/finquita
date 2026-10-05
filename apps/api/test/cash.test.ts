import { newId, type OpPayload } from "@mostrador/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { alerts } from "../src/db/schema/index";
import { as, memberId, pinOf } from "./helpers/actors";
import type { TestClient } from "./helpers/client";
import { TEST_AUTH } from "./helpers/client";
import { customer, op, openShift, REGISTER } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });
const push = (c: TestClient, ops: unknown[]) =>
  c.post("/api/sync/push", { deviceNow: new Date().toISOString(), ops });

/** Venta de "varios" por un monto, con un medio de pago. */
function miscSale(
  shiftId: string,
  cents: number,
  method: "cash" | "debit" = "cash",
  number = 1,
): OpPayload<"sale.create"> {
  return {
    id: newId(),
    registerId: REGISTER,
    shiftId,
    number,
    customerId: null,
    lines: [
      {
        id: newId(),
        kind: "misc",
        productId: null,
        description: "Varios",
        qty: 1,
        unit: "unit",
        unitPriceCents: cents,
        discountCents: 0,
        totalCents: cents,
      },
    ],
    payments: [{ id: newId(), method, amountCents: cents, surchargeCents: 0, verified: false }],
    subtotalCents: cents,
    discountCents: 0,
    surchargeCents: 0,
    totalCents: cents,
    changeCents: 0,
    receiptType: "ticket",
  };
}

describe("caja: turno en curso", () => {
  it("el efectivo esperado del ejemplo da $ 121.900, con su cuenta", async () => {
    const tomas = await as(app(), ref.t.db, "tomas");
    const shiftId = newId();
    // Tomás pide autorización para el gasto: Julián tipea su PIN.
    const auth = await tomas.post("/api/pin/authorize", {
      pin: pinOf("julian"),
      permission: "cash_movement",
    });
    expect(auth.status).toBe(200);
    expect(auth.body).toMatchObject({ memberId: memberId("julian"), name: "Julián" });
    const r = await push(tomas, [
      openShift(shiftId, 2_000_000),
      op("sale.create", miscSale(shiftId, 6_000_000, "cash", 1)),
      op("sale.create", miscSale(shiftId, 3_840_000, "cash", 2)),
      op("sale.create", miscSale(shiftId, 5_640_000, "debit", 3)),
      op("credit.payment", {
        id: newId(),
        customerId: customer("rosa"),
        amountCents: 800_000,
        method: "cash",
        shiftId,
        applyTo: "oldest",
      }),
      op(
        "cash.movement",
        {
          id: newId(),
          shiftId,
          kind: "expense",
          amountCents: 450_000,
          reason: "Artículos de limpieza",
          category: "cleaning",
        },
        { authorizedBy: "julian" },
      ),
    ]);
    expect(r.body.results.map((x: { status: string }) => x.status)).toEqual(
      Array(6).fill("applied"),
    );

    const s = await tomas.get(`/api/shifts/${shiftId}`);
    expect(s.status).toBe(200);
    expect(s.body.summary.expectedCashCents).toBe(12_190_000);
    expect(s.body.summary.lines).toEqual([
      { label: "Fondo inicial", amountCents: 2_000_000 },
      { label: "Ventas en efectivo", amountCents: 9_840_000 },
      { label: "Cobros de fiado en efectivo", amountCents: 800_000 },
      { label: "Gasto: artículos de limpieza", amountCents: -450_000 },
    ]);
    expect(s.body.summary.byMethod.debit).toEqual({ amountCents: 5_640_000, count: 1 });
    expect(s.body.shift).toMatchObject({
      memberName: "Tomás",
      registerName: "Caja 1",
      status: "open",
    });
    const gasto = s.body.movements.find((m: { kind: string }) => m.kind === "expense");
    expect(gasto).toMatchObject({
      amountCents: -450_000,
      authorizedByName: "Julián",
      memberName: "Tomás",
      category: "cleaning",
    });

    const regs = await tomas.get("/api/registers");
    expect(regs.body[0].openShift).toMatchObject({
      id: shiftId,
      memberName: "Tomás",
      openingFloatCents: 2_000_000,
    });
  });

  it("retiro, ingreso y pago a proveedor en efectivo", async () => {
    const julian = await as(app(), ref.t.db, "julian");
    const shiftId = newId();
    const invoices = await julian.get("/api/supplier-invoices/pending");
    const panaderia = invoices.body.find(
      (i: { supplierName: string }) => i.supplierName === "Panificadora San Martín",
    );
    expect(panaderia.pendingCents).toBe(4_100_000);
    const r = await push(julian, [
      openShift(shiftId, 2_000_000, "julian"),
      op(
        "cash.movement",
        {
          id: newId(),
          shiftId,
          kind: "income",
          amountCents: 1_000_000,
          reason: "Cambio que trajo Carlos",
        },
        { by: "julian" },
      ),
      op(
        "cash.movement",
        {
          id: newId(),
          shiftId,
          kind: "withdrawal",
          amountCents: 500_000,
          reason: "A la caja fuerte",
        },
        { by: "julian" },
      ),
      op(
        "cash.movement",
        {
          id: newId(),
          shiftId,
          kind: "supplier_payment",
          amountCents: 1_000_000,
          reason: "Pago parcial pan",
          invoiceId: panaderia.id,
        },
        { by: "julian" },
      ),
    ]);
    expect(r.body.results.map((x: { status: string }) => x.status)).toEqual(
      Array(4).fill("applied"),
    );
    const s = await julian.get(`/api/shifts/${shiftId}`);
    expect(s.body.summary.expectedCashCents).toBe(1_500_000);
    expect(s.body.summary.lines.map((l: { label: string }) => l.label)).toEqual([
      "Fondo inicial",
      "Ingresos",
      "Retiro: a la caja fuerte",
      "Pago a proveedor: pago parcial pan",
    ]);
    const after = await julian.get("/api/supplier-invoices/pending");
    expect(after.body.find((i: { id: string }) => i.id === panaderia.id)).toMatchObject({
      status: "partial",
      pendingCents: 3_100_000,
    });
  });

  it("el cajero no hace retiros sin PIN; el PIN de otro cajero no autoriza", async () => {
    const tomas = await as(app(), ref.t.db, "tomas");
    const shiftId = newId();
    const r = await push(tomas, [
      openShift(shiftId),
      op("cash.movement", {
        id: newId(),
        shiftId,
        kind: "withdrawal",
        amountCents: 100_000,
        reason: "Para mí",
      }),
    ]);
    expect(r.body.results[1]).toMatchObject({ status: "rejected" });
    const bad = await tomas.post("/api/pin/authorize", {
      pin: pinOf("lucia"),
      permission: "cash_movement",
    });
    expect(bad.status).toBe(403);
    expect(bad.body.error.code).toBe("pin_wrong");
  });

  it("el repositor no ve la caja", async () => {
    const tomas = await as(app(), ref.t.db, "tomas");
    const shiftId = newId();
    await push(tomas, [openShift(shiftId)]);
    const nico = await as(app(), ref.t.db, "nico");
    expect((await nico.get(`/api/shifts/${shiftId}`)).status).toBe(403);
  });
});

describe("arqueo y cierre", () => {
  it("con $ 120.700 contados la diferencia es −$ 1.200, pide comentario y avisa al dueño", async () => {
    const tomas = await as(app(), ref.t.db, "tomas");
    const shiftId = newId();
    await push(tomas, [
      // Turno tarde: abrió a las 14:00.
      openShift(shiftId, 2_000_000, "tomas", "2026-10-03T14:00:00-03:00"),
      op("sale.create", miscSale(shiftId, 9_840_000, "cash", 11)),
      op("credit.payment", {
        id: newId(),
        customerId: customer("rosa"),
        amountCents: 800_000,
        method: "cash",
        shiftId,
        applyTo: "oldest",
      }),
      op(
        "cash.movement",
        {
          id: newId(),
          shiftId,
          kind: "expense",
          amountCents: 450_000,
          reason: "Artículos de limpieza",
          category: "cleaning",
        },
        { authorizedBy: "julian" },
      ),
    ]);
    const close = (note: string | null) =>
      op("cash.shift_close", {
        shiftId,
        countedCashCents: 12_070_000,
        counts: { "20000": 5, "10000": 2, "500": 1, "200": 1 },
        expectedCashCents: 12_190_000,
        differenceCents: -120_000,
        note,
        leftFloatCents: 2_000_000,
        withdrawnCents: 10_070_000,
      });
    // Sin comentario no se cierra (con conexión, desde la app, el comentario es obligatorio).
    const { closeShift } = await import("../src/domain/cash");
    const { ContextBuilder } = await import("../src/domain/context");
    const ctx = await new ContextBuilder(ref.t.db).build({
      memberId: memberId("tomas"),
      deviceId: null,
      at: new Date(),
      offline: false,
    });
    const noNote = close(null).payload;
    await expect(ref.t.db.transaction((tx) => closeShift(tx, ctx, noNote))).rejects.toThrow(
      "tolerancia",
    );

    const r = await push(tomas, [close("Di mal un vuelto a la tarde")]);
    expect(r.body.results[0]).toMatchObject({
      status: "applied",
      result: { expectedCashCents: 12_190_000, differenceCents: -120_000, mismatchCents: 0 },
    });
    const s = await tomas.get(`/api/shifts/${shiftId}`);
    expect(s.body.shift).toMatchObject({
      status: "closed",
      countedCashCents: 12_070_000,
      differenceCents: -120_000,
      leftFloatCents: 2_000_000,
      closeNote: "Di mal un vuelto a la tarde",
    });
    const [alert] = await ref.t.db.select().from(alerts).where(eq(alerts.refId, shiftId));
    expect(alert).toMatchObject({
      kind: "cash_difference",
      severity: "danger",
      title:
        "Cierre turno tarde (Tomás): ventas $ 98.400, efectivo contado $ 120.700, diferencia −$ 1.200",
    });
    // El historial de cierres lo muestra con su diferencia.
    const hist = await tomas.get("/api/shifts?limit=5");
    expect(hist.body.find((x: { id: string }) => x.id === shiftId)).toMatchObject({
      differenceCents: -120_000,
      salesCents: 9_840_000,
    });
  });
});
