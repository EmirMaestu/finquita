import { addDays, newId, todayAR } from "@mostrador/shared";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { cashMovements } from "../src/db/schema/index";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { customer, op, openShift, REGISTER } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

// El fiado de Rosa es de hace una semana: el escenario se carga 7 días antes de hoy.
const ref = useSeededDb({ today: addDays(todayAR(), -7) });
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });
const ROSA = customer("rosa");
type Mov = {
  kind: string;
  amountCents: number;
  balanceCents: number;
  openCents: number | null;
  label: string;
  reversed: boolean;
  id: string;
};

/** Venta fiada de $ 6.700 (un ítem varios), con la fecha que se le pase. */
function creditSale(shiftId: string, at: string) {
  return op(
    "sale.create",
    {
      id: newId(),
      registerId: REGISTER,
      shiftId,
      number: 4300,
      customerId: ROSA,
      lines: [
        {
          id: newId(),
          kind: "misc",
          productId: null,
          description: "Varios",
          qty: 1,
          unit: "unit",
          unitPriceCents: 670_000,
          discountCents: 0,
          totalCents: 670_000,
        },
      ],
      payments: [
        {
          id: newId(),
          method: "account",
          amountCents: 670_000,
          surchargeCents: 0,
          verified: false,
          customerId: ROSA,
        },
      ],
      subtotalCents: 670_000,
      discountCents: 0,
      surchargeCents: 0,
      totalCents: 670_000,
      changeCents: 0,
      receiptType: "ticket",
    },
    { at },
  );
}

describe("flujo 6: fiado de Rosa Giménez", () => {
  it("$ 18.400 → fía $ 6.700 → $ 25.100 → paga $ 20.000 en efectivo → $ 5.100, cancelando lo más viejo", async () => {
    const tomas = await as(app(), ref.t.db, "tomas");
    const before = await tomas.get(`/api/customers/${ROSA}`);
    expect(before.body).toMatchObject({
      balanceCents: 1_840_000,
      creditLimitCents: 3_000_000,
      overdueCents: 0,
    });

    // Hace una semana: venta de $ 6.700 con Fiado.
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const shift1 = newId();
    const sale = await tomas.post("/api/sync/push", {
      deviceNow: new Date().toISOString(),
      ops: [openShift(shift1, 2_000_000, "tomas", weekAgo), creditSale(shift1, weekAgo)],
    });
    expect(sale.body.results.map((r: { status: string }) => r.status)).toEqual([
      "applied",
      "applied",
    ]);
    expect((await tomas.get(`/api/customers/${ROSA}`)).body).toMatchObject({
      balanceCents: 2_510_000,
      availableCents: 490_000,
    });

    // Hoy: Rosa paga $ 20.000 en efectivo; entra a la caja del turno.
    const shift2 = newId();
    const payId = newId();
    const pay = await tomas.post("/api/sync/push", {
      deviceNow: new Date().toISOString(),
      ops: [
        openShift(shift2),
        op("credit.payment", {
          id: payId,
          customerId: ROSA,
          amountCents: 2_000_000,
          method: "cash",
          shiftId: shift2,
          applyTo: "oldest",
        }),
      ],
    });
    expect(pay.body.results[1]).toMatchObject({
      status: "applied",
      result: { balanceCents: 510_000 },
    });
    const [cash] = await ref.t.db
      .select()
      .from(cashMovements)
      .where(and(eq(cashMovements.shiftId, shift2), eq(cashMovements.kind, "credit_payment")));
    expect(cash).toMatchObject({ amountCents: 2_000_000, method: "cash" });

    const after = await tomas.get(`/api/customers/${ROSA}`);
    expect(after.body.balanceCents).toBe(510_000);
    const charges = (after.body.movements as Mov[]).filter((m) => m.kind === "sale").reverse();
    // Lo más viejo quedó cancelado: $ 8.400 y $ 10.000; de la compra de $ 6.700 quedan $ 5.100.
    expect(charges.map((m) => [m.amountCents, m.openCents])).toEqual([
      [840_000, 0],
      [1_000_000, 0],
      [670_000, 510_000],
    ]);
    expect((after.body.movements as Mov[])[0]).toMatchObject({
      kind: "payment",
      amountCents: -2_000_000,
      balanceCents: 510_000,
    });
  });
});

describe("cuenta corriente", () => {
  it("lista con la plata en la calle y filtros de vencidos y sobre el límite", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const all = await carlos.get("/api/customers");
    expect(all.body.totals.inTheStreetCents).toBe(7_380_000);
    expect(typeof all.body.totals.collectedThisMonthCents).toBe("number");
    const rosa = all.body.items.find((c: { id: string }) => c.id === ROSA);
    expect(rosa).toMatchObject({ balanceCents: 1_840_000, oldestDebtDays: 12 + 7 });
    const overLimit = await carlos.get("/api/customers?filter=over_limit");
    expect(overLimit.body.items.map((c: { name: string }) => c.name)).toEqual(["El Tano (obra)"]);
    const overdue = await carlos.get("/api/customers?filter=overdue");
    expect(overdue.body.items.map((c: { name: string }) => c.name).sort()).toEqual([
      "El Tano (obra)",
      "Familia Ortiz",
      "Sergio Paz",
    ]);
    expect((await carlos.get("/api/customers?q=tano")).body.items).toHaveLength(1);
  });

  it("un movimiento no se borra: se anula con un contramovimiento visible", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const detail = await carlos.get(`/api/customers/${ROSA}`);
    const newest = (detail.body.movements as Mov[]).find((m) => m.kind === "sale");
    const r = await carlos.post(`/api/customers/${ROSA}/ledger/${newest?.id}/reverse`, {
      reason: "Se cargó dos veces",
    });
    expect(r.status).toBe(200);
    const after = await carlos.get(`/api/customers/${ROSA}`);
    expect(after.body.balanceCents).toBe(840_000);
    expect(after.body.movements[0]).toMatchObject({
      kind: "reversal",
      amountCents: -1_000_000,
      label: "Anulación",
    });
    expect((after.body.movements as Mov[]).find((m) => m.id === newest?.id)?.reversed).toBe(true);
    expect(
      (
        await carlos.post(`/api/customers/${ROSA}/ledger/${newest?.id}/reverse`, {
          reason: "otra vez",
        })
      ).status,
    ).toBe(400);
    // El cajero no anula.
    const tomas = await as(app(), ref.t.db, "tomas");
    expect(
      (await tomas.post(`/api/customers/${ROSA}/ledger/${newest?.id}/reverse`, { reason: "x" }))
        .status,
    ).toBe(403);
  });

  it("estado de cuenta en PDF", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const res = await app().request(`http://localhost/api/customers/${ROSA}/statement.pdf`, {
      headers: {
        "x-device-token": carlos.deviceToken ?? "",
        authorization: `Bearer ${carlos.pinToken}`,
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(new TextDecoder().decode(new Uint8Array(await res.arrayBuffer()).slice(0, 5))).toBe(
      "%PDF-",
    );
  });
});
