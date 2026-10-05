import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId } from "@mostrador/shared";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import {
  alerts,
  lots,
  products,
  purchaseOrders,
  stockMovements,
  supplierInvoices,
} from "../src/db/schema/index";
import { seedId } from "../src/seed/ids";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { op, product } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });
const ORDER_42 = seedId("order:0042");
const LACTEOS = seedId("supplier:lacteos");

beforeAll(async () => {
  process.env.FILES_DIR = await mkdtemp(join(tmpdir(), "mostrador-files-"));
});

type ROLine = {
  orderLineId: string;
  productId: string;
  name: string;
  ordered: number;
  costCents?: number;
  marginBp?: number;
  tracksExpiry: boolean;
  barcodes: string[];
};
const stockOf = async (key: string) =>
  (
    await ref.t.db
      .select()
      .from(products)
      .where(eq(products.id, product(key)))
  )[0];

async function receive(by: "nico" | "carlos" | "tomas", payload: object) {
  const who = await as(app(), ref.t.db, by);
  return who.post("/api/sync/push", {
    deviceNow: new Date().toISOString(),
    ops: [op("receipt.confirm", payload as never, { by })],
  });
}

describe("recepción del pedido 0042", () => {
  it("el repositor carga cantidades sin ver costos; el dueño completa los costos y queda la cuenta a pagar", async () => {
    const julian = await as(app(), ref.t.db, "julian");
    await julian.post(`/api/orders/${ORDER_42}/status`, { status: "sent", via: "whatsapp" });
    const nico = await as(app(), ref.t.db, "nico");
    expect(
      (await nico.get("/api/receipts/expected")).body.map((o: { number: number }) => o.number),
    ).toEqual([41, 42]);
    const data = await nico.get(`/api/receipts/order/${ORDER_42}`);
    expect(data.body.lines).toHaveLength(14);
    expect(data.body.lines[0].costCents).toBeUndefined();
    const lines: ROLine[] = data.body.lines;
    const leche = lines.find((l) => l.name === "Leche entera 1 L sachet");
    expect(leche?.barcodes).toContain("7790000002014");

    const receiptId = newId();
    const push = await receive("nico", {
      id: receiptId,
      kind: "order",
      orderId: ORDER_42,
      lines: lines.map((l) => ({
        id: newId(),
        productId: l.productId,
        orderLineId: l.orderLineId,
        qty: l.name === "Yogur bebible 1 L" ? 10 : l.ordered,
        damagedQty: l.name === "Ricota 500 g" ? 1 : 0,
        ...(l.name === "Leche entera 1 L sachet"
          ? { lotCode: "L-881", expiresOn: "2026-10-20" }
          : {}),
        unitCostCents: 999_999, // lo ignora: el repositor no ve costos
      })),
    });
    expect(push.body.results[0]).toMatchObject({
      status: "applied",
      result: { costsPending: true, orderStatus: "partial", invoiceId: null },
    });

    expect((await stockOf("leche"))?.stockQty).toBe(24);
    expect((await stockOf("yogur"))?.stockQty).toBe(4 + 10);
    expect((await stockOf("ricota"))?.stockQty).toBe(2 + 3);
    expect((await stockOf("yogur"))?.costCents).toBe(210_000);
    const [lot] = await ref.t.db.select().from(lots).where(eq(lots.receiptId, receiptId));
    expect(lot).toMatchObject({ code: "L-881", expiresOn: "2026-10-20", qtyRemaining: 24 });
    const moves = await ref.t.db
      .select()
      .from(stockMovements)
      .where(
        and(eq(stockMovements.refId, receiptId), eq(stockMovements.productId, product("leche"))),
      );
    expect(moves).toMatchObject([{ kind: "receipt", qty: 24, lotId: lot?.id }]);
    const [order] = await ref.t.db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, ORDER_42));
    expect(order?.status).toBe("partial");
    expect(
      await ref.t.db.select().from(alerts).where(eq(alerts.kind, "receipt_costs")),
    ).toHaveLength(1);

    // El dueño completa los costos: el yogur subió 12 %.
    const carlos = await as(app(), ref.t.db, "carlos");
    const pending = await carlos.get("/api/receipts?costsPending=1");
    expect(pending.body).toMatchObject([{ id: receiptId, by: "Nico", orderNumber: 42 }]);
    const detail = await carlos.get(`/api/receipts/${receiptId}`);
    const yogurLine = detail.body.lines.find(
      (l: { name: string }) => l.name === "Yogur bebible 1 L",
    );
    expect(yogurLine).toMatchObject({
      previousCostCents: 210_000,
      marginBp: 4286,
      priceCents: 300_000,
    });
    const done = await carlos.post(`/api/receipts/${receiptId}/costs`, {
      lines: [{ lineId: yogurLine.id, unitCostCents: 235_000 }],
      invoiceNumber: "A-0001-00012345",
    });
    expect(done.status).toBe(200);
    const yogur = await stockOf("yogur");
    expect(yogur).toMatchObject({ costCents: 235_000, priceReview: true, priceCents: 300_000 });
    const [inv] = await ref.t.db
      .select()
      .from(supplierInvoices)
      .where(eq(supplierInvoices.receiptId, receiptId));
    expect(inv).toMatchObject({
      supplierId: LACTEOS,
      kind: "invoice",
      number: "A-0001-00012345",
      amountCents: done.body.totalCents,
      status: "pending",
    });
    // 14 productos: lo pedido menos 2 yogures que faltaron y 1 ricota dañada; el yogur a $ 2.350.
    expect(done.body.totalCents).toBe(18_640_000 - 2 * 210_000 - 180_000 + 10 * 25_000);
    expect((await carlos.post(`/api/receipts/${receiptId}/costs`, { lines: [] })).status).toBe(400);
  });

  it("el dueño recibe con el costo nuevo y actualiza el precio en el momento", async () => {
    const lines = (
      await (await as(app(), ref.t.db, "carlos")).get(`/api/receipts/order/${ORDER_42}`)
    ).body.lines as ROLine[];
    const yogur = lines.find((l) => l.name === "Yogur bebible 1 L");
    expect(yogur).toMatchObject({ costCents: 210_000, marginBp: 4286 });
    const push = await receive("carlos", {
      id: newId(),
      kind: "order",
      orderId: ORDER_42,
      lines: lines.map((l) => ({
        id: newId(),
        productId: l.productId,
        orderLineId: l.orderLineId,
        qty: l.ordered,
        ...(l === yogur ? { unitCostCents: 235_000, newPriceCents: 340_000 } : {}),
      })),
    });
    expect(push.body.results[0]).toMatchObject({
      status: "applied",
      result: {
        costsPending: false,
        orderStatus: "received",
        totalCents: 18_640_000 + 12 * 25_000,
      },
    });
    expect(await stockOf("yogur")).toMatchObject({
      costCents: 235_000,
      priceCents: 340_000,
      priceReview: false,
    });
    const invoices = await ref.t.db
      .select()
      .from(supplierInvoices)
      .where(eq(supplierInvoices.supplierId, LACTEOS));
    expect(invoices.find((i) => i.amountCents === 18_940_000)).toMatchObject({
      kind: "delivery_note",
    });
  });
});

describe("sin pedido", () => {
  it("compra en mayorista con la foto del remito", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const photoId = newId();
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    const up = await app().request(`http://localhost/api/files/${photoId}`, {
      method: "PUT",
      headers: {
        "content-type": "image/jpeg",
        "x-device-token": carlos.deviceToken ?? "",
        authorization: `Bearer ${carlos.pinToken}`,
      },
      body: jpeg,
    });
    expect(up.status).toBe(200);
    const got = await app().request(`http://localhost/api/files/${photoId}`, {
      headers: {
        "x-device-token": carlos.deviceToken ?? "",
        authorization: `Bearer ${carlos.pinToken}`,
      },
    });
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(jpeg);
    const id = newId();
    const push = await receive("carlos", {
      id,
      kind: "wholesale",
      supplierId: seedId("supplier:mayorista"),
      photoId,
      lines: [{ id: newId(), productId: product("maple"), qty: 3, unitCostCents: 630_000 }],
    });
    expect(push.body.results[0].status).toBe("applied");
    // El maple mueve el stock de su producto base: 30 huevos por maple.
    expect((await stockOf("huevo"))?.stockQty).toBe((4 + 3) * 30);
    const r = await carlos.get(`/api/receipts/${id}`);
    expect(r.body).toMatchObject({
      kind: "wholesale",
      photoUrl: `/api/files/${photoId}`,
      totalCents: 1_890_000,
    });
  });

  it("el cajero no recibe mercadería", async () => {
    const push = await receive("tomas", {
      id: newId(),
      kind: "no_order",
      lines: [{ id: newId(), productId: product("maple"), qty: 1 }],
    });
    expect(push.body.results[0]).toMatchObject({ status: "rejected" });
    expect(push.body.results[0].reason).toContain("Recibir mercadería: no tiene permiso");
  });
});
