import { newId, todayAR } from "@mostrador/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { cashMovements, products } from "../src/db/schema/index";
import { seedId } from "../src/seed/ids";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { op, openShift, product } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

// Los vencimientos se miran contra hoy: el escenario se carga con la fecha de hoy.
const ref = useSeededDb({ today: todayAR() });
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });
const LACTEOS = seedId("supplier:lacteos");
const ANDINA = seedId("supplier:andina");
type Item = { id: string; supplierId: string; kind: string; state: string; pendingCents: number };
type Bal = { supplierId: string; cents: number };

async function owner() {
  return as(app(), ref.t.db, "carlos");
}
const balanceOf = async (supplierId: string) => {
  const r = await (await owner()).get("/api/payables?view=all");
  return r.body.summary.bySupplier.find((b: Bal) => b.supplierId === supplierId)?.cents ?? 0;
};
const invoiceOf = async (supplierId: string) => {
  const r = await (await owner()).get(`/api/payables?supplierId=${supplierId}`);
  return r.body.items.find((i: Item) => i.kind !== "credit_note") as Item;
};

describe("saldo por proveedor", () => {
  it("arranca con el escenario: $ 344.600 a pagar, con la agenda de la semana", async () => {
    const r = await (await owner()).get("/api/payables");
    expect(r.body.summary).toMatchObject({
      totalCents: 34_460_000,
      overdueCents: 0,
      creditNotesCents: 0,
    });
    const by = Object.fromEntries(
      r.body.summary.bySupplier.map((b: Bal & { name: string }) => [b.name, b.cents]),
    );
    expect(by).toEqual({
      "Lácteos del Sur": 18_450_000,
      "Distribuidora Andina": 9_630_000,
      "Panificadora San Martín": 4_100_000,
      "Limpieza Cuyo": 2_280_000,
    });
    // Lácteos vence mañana: primera en la agenda.
    expect(r.body.items[0]).toMatchObject({ supplierName: "Lácteos del Sur", state: "pending" });
    expect(r.body.summary.dueThisWeekCents).toBe(18_450_000 + 9_630_000 + 4_100_000);
  });

  it("pago por transferencia parcial, sin pasarse, y el saldo baja también en Proveedores", async () => {
    const carlos = await owner();
    const inv = await invoiceOf(LACTEOS);
    const pay = await carlos.post(`/api/payables/${inv.id}/pay`, {
      method: "transfer",
      amountCents: 10_000_000,
      note: "Transferencia Galicia",
    });
    expect(pay.body).toMatchObject({ pendingCents: 8_450_000 });
    expect((await carlos.get(`/api/payables/${inv.id}`)).body).toMatchObject({
      state: "partial",
      payments: [{ method: "transfer", amountCents: 10_000_000, by: "Carlos Díaz" }],
    });
    expect(await balanceOf(LACTEOS)).toBe(8_450_000);
    const sup = await carlos.get("/api/suppliers");
    expect(sup.body.find((s: { id: string }) => s.id === LACTEOS).balanceCents).toBe(8_450_000);
    const over = await carlos.post(`/api/payables/${inv.id}/pay`, {
      method: "transfer",
      amountCents: 9_000_000,
    });
    expect(over.status).toBe(422);
  });

  it("nota de crédito por devolución: resta del saldo y se aplica a la factura", async () => {
    const carlos = await owner();
    const cn = await carlos.post("/api/payables", {
      supplierId: ANDINA,
      kind: "credit_note",
      number: "NC-0001-00000077",
      issuedOn: "2026-10-05",
      amountCents: 460_000,
    });
    expect(cn.status).toBe(201);
    expect(await balanceOf(ANDINA)).toBe(9_630_000 - 460_000);
    const summary = (await carlos.get("/api/payables")).body.summary;
    expect(summary.creditNotesCents).toBe(460_000);
    const inv = await invoiceOf(ANDINA);
    const applied = await carlos.post(`/api/payables/${inv.id}/apply-credit`, {
      creditNoteId: cn.body.id,
    });
    expect(applied.body).toEqual({ appliedCents: 460_000, pendingCents: 9_170_000 });
    expect(await balanceOf(ANDINA)).toBe(9_170_000);
    expect((await carlos.get("/api/payables")).body.summary.creditNotesCents).toBe(0);
  });

  it("pagar en efectivo desde la caja crea el movimiento y salda la factura", async () => {
    const inv = await invoiceOf(LACTEOS);
    const carlos = await owner();
    const shiftId = newId();
    const moveId = newId();
    const push = await carlos.post("/api/sync/push", {
      deviceNow: new Date().toISOString(),
      ops: [
        openShift(shiftId, 20_000_000, "carlos"),
        op(
          "cash.movement",
          {
            id: moveId,
            shiftId,
            kind: "supplier_payment",
            amountCents: 18_450_000,
            reason: "Pago a Lácteos del Sur",
            invoiceId: inv.id,
          },
          { by: "carlos" },
        ),
      ],
    });
    expect(push.body.results.map((x: { status: string }) => x.status)).toEqual([
      "applied",
      "applied",
    ]);
    const [move] = await ref.t.db.select().from(cashMovements).where(eq(cashMovements.id, moveId));
    expect(move).toMatchObject({
      kind: "supplier_payment",
      amountCents: -18_450_000,
      method: "cash",
    });
    expect(await balanceOf(LACTEOS)).toBe(0);
    expect((await carlos.get(`/api/payables/${inv.id}`)).body).toMatchObject({
      state: "paid",
      payments: [{ method: "cash", cashMovementId: moveId }],
    });
    expect(
      (await carlos.get("/api/payables?view=paid")).body.items.map((i: Item) => i.id),
    ).toContain(inv.id);
  });

  it("vencida: pasó la fecha con saldo", async () => {
    const carlos = await owner();
    await carlos.post("/api/payables", {
      supplierId: ANDINA,
      kind: "invoice",
      number: "A-1",
      issuedOn: "2026-09-01",
      dueOn: "2026-09-15",
      amountCents: 1_000_000,
    });
    const r = await carlos.get("/api/payables");
    expect(r.body.items[0]).toMatchObject({ number: "A-1", state: "overdue" });
    expect(r.body.summary.overdueCents).toBe(1_000_000);
    expect(await balanceOf(ANDINA)).toBe(9_630_000 + 1_000_000);
  });

  it("el encargado sin permiso de costos no ve facturas", async () => {
    const julian = await as(app(), ref.t.db, "julian");
    expect((await julian.get("/api/payables")).status).toBe(403);
  });
});

describe("lista de precios del proveedor", () => {
  it('relaciona códigos, aplica IVA y bonificación, y deja "Revisar precio"', async () => {
    const carlos = await owner();
    const rows = [
      { code: "YB-1L", description: "YOGUR BEBIBLE FRUTILLA 1LT", costCents: 200_000 },
      { code: "7790000002014", description: "LECHE ENTERA SACHET", costCents: 111_570 },
      { code: "ZZ-99", description: "PRODUCTO NUEVO", costCents: 50_000 },
    ];
    const prev = await carlos.post(`/api/suppliers/${LACTEOS}/price-list/preview`, {
      terms: { vatIncluded: false, vatBp: 2100, discountBp: 1000 },
      rows,
    });
    expect(prev.body.matched).toMatchObject([
      {
        code: "YB-1L",
        name: "Yogur bebible 1 L",
        oldCostCents: 210_000,
        newCostCents: 217_800,
        changeBp: 371,
      },
      {
        code: "7790000002014",
        name: "Leche entera 1 L sachet",
        oldCostCents: 135_000,
        newCostCents: 121_500,
      },
    ]);
    expect(prev.body.unmatched).toMatchObject([{ index: 2, code: "ZZ-99" }]);
    // El que no se encontró se relaciona a mano.
    const linked = await carlos.post(`/api/suppliers/${LACTEOS}/price-list/preview`, {
      terms: { vatIncluded: true, vatBp: 2100, discountBp: 0 },
      rows,
      links: { "2": product("ricota") },
    });
    expect(linked.body.unmatched).toEqual([]);
    const apply = await carlos.post(`/api/suppliers/${LACTEOS}/price-list/apply`, {
      items: prev.body.matched.map(
        (m: { productId: string; code: string; newCostCents: number }) => ({
          productId: m.productId,
          supplierCode: m.code,
          costCents: m.newCostCents,
        }),
      ),
    });
    expect(apply.body).toMatchObject({ updated: 2 });
    expect(apply.body.changed).toHaveLength(2);
    const [yogur] = await ref.t.db
      .select()
      .from(products)
      .where(eq(products.id, product("yogur")));
    expect(yogur).toMatchObject({ costCents: 217_800, priceReview: true, priceCents: 300_000 });
  });
});
