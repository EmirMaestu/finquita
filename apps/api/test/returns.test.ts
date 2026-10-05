import { newId } from "@mostrador/shared";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { alerts, cashMovements, products, stockMovements } from "../src/db/schema/index";
import { as } from "./helpers/actors";
import type { TestClient } from "./helpers/client";
import { TEST_AUTH } from "./helpers/client";
import { op, openShift, product, saleOf } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });
const push = (c: TestClient, ops: unknown[]) =>
  c.post("/api/sync/push", { deviceNow: new Date().toISOString(), ops });
const stock = async (key: string) =>
  (
    await ref.t.db
      .select()
      .from(products)
      .where(eq(products.id, product(key)))
  )[0]?.stockQty;

/** Tomás abre caja y vende 3 cervezas y 2 yogures. */
async function sold() {
  const tomas = await as(app(), ref.t.db, "tomas");
  const shiftId = newId();
  const sale = saleOf(
    shiftId,
    [
      { key: "cerveza", qty: 3 },
      { key: "yogur", qty: 2 },
    ],
    { tendered: 1_290_000 },
  );
  const r = await push(tomas, [openShift(shiftId), op("sale.create", sale)]);
  expect(r.body.results.map((x: { status: string }) => x.status)).toEqual(["applied", "applied"]);
  return { tomas, shiftId, sale };
}

describe("devoluciones", () => {
  it("lo devuelto vuelve a la góndola o va a merma", async () => {
    const { tomas, shiftId, sale } = await sold();
    expect(await stock("cerveza")).toBe(45);
    expect(await stock("yogur")).toBe(2);
    const [cerveza, yogur] = sale.lines;
    const ret = op(
      "sale.return",
      {
        id: newId(),
        saleId: sale.id,
        reason: "expired",
        refundMethod: "cash",
        shiftId,
        lines: [
          // Una cerveza sana vuelve a la góndola.
          {
            id: newId(),
            saleLineId: cerveza?.id ?? "",
            qty: 1,
            totalCents: 230_000,
            destination: "shelf",
          },
          // Los dos yogures vencidos van a merma.
          {
            id: newId(),
            saleLineId: yogur?.id ?? "",
            qty: 2,
            totalCents: 600_000,
            destination: "waste",
          },
        ],
        totalCents: 830_000,
      },
      { authorizedBy: "julian" },
    );
    const r = await push(tomas, [ret]);
    expect(r.body.results[0]).toMatchObject({ status: "applied" });
    // Góndola: +1. Merma: entra y sale (el stock no cambia, pero queda la merma registrada).
    expect(await stock("cerveza")).toBe(46);
    expect(await stock("yogur")).toBe(2);
    const yogurMoves = await ref.t.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, product("yogur")));
    expect(
      yogurMoves.filter((m) => m.refType === "sale_return").map((m) => [m.kind, m.qty]),
    ).toEqual([
      ["return", 2],
      ["waste", -2],
    ]);
    // La plata sale de la caja.
    const refund = await ref.t.db
      .select()
      .from(cashMovements)
      .where(and(eq(cashMovements.shiftId, shiftId), eq(cashMovements.kind, "refund")));
    expect(refund.map((m) => m.amountCents)).toEqual([-830_000]);
    // No se puede devolver más de lo vendido.
    const again = await push(tomas, [
      op(
        "sale.return",
        {
          id: newId(),
          saleId: sale.id,
          reason: "faulty",
          refundMethod: "cash",
          shiftId,
          lines: [
            {
              id: newId(),
              saleLineId: yogur?.id ?? "",
              qty: 1,
              totalCents: 300_000,
              destination: "shelf",
            },
          ],
          totalCents: 300_000,
        },
        { authorizedBy: "julian" },
      ),
    ]);
    expect(again.body.results[0].reason).toContain("más de lo que se vendió");
  });

  it("el cajero necesita PIN para devolver", async () => {
    const { tomas, shiftId, sale } = await sold();
    const r = await push(tomas, [
      op("sale.return", {
        id: newId(),
        saleId: sale.id,
        reason: "exchange",
        refundMethod: "cash",
        shiftId,
        lines: [
          {
            id: newId(),
            saleLineId: sale.lines[0]?.id ?? "",
            qty: 1,
            totalCents: 230_000,
            destination: "shelf",
          },
        ],
        totalCents: 230_000,
      }),
    ]);
    expect(r.body.results[0]).toMatchObject({ status: "rejected" });
    expect(r.body.results[0].reason).toContain("PIN");
  });
});

describe("anulaciones", () => {
  it("anular devuelve el stock y la plata, queda como Anulada y avisa", async () => {
    const { tomas, shiftId, sale } = await sold();
    const r = await push(tomas, [
      op(
        "sale.void",
        { saleId: sale.id, reason: "Error de cobro", shiftId },
        { authorizedBy: "julian" },
      ),
    ]);
    expect(r.body.results[0]).toMatchObject({ status: "applied" });
    expect(await stock("cerveza")).toBe(48);
    expect(await stock("yogur")).toBe(4);
    const s = await tomas.get(`/api/shifts/${shiftId}`);
    expect(s.body.summary.salesCents).toBe(0);
    const detail = await tomas.get(`/api/sales/${sale.id}`);
    expect(detail.body).toMatchObject({ status: "voided", voidReason: "Error de cobro" });
    expect(detail.body.timeline.map((t: { text: string }) => t.text).join(" | ")).toContain(
      "Anulada por Tomás",
    );
    const [alert] = await ref.t.db.select().from(alerts).where(eq(alerts.kind, "sale_voided"));
    expect(alert?.title).toContain("anulada");
  });
});

describe("historial de ventas", () => {
  it("filtra por número, estado y medio; el cajero ve solo lo suyo", async () => {
    const { tomas, sale } = await sold();
    const julian = await as(app(), ref.t.db, "julian");
    const byNumber = await julian.get(`/api/sales?number=${sale.number}`);
    expect(byNumber.body.map((s: { id: string }) => s.id)).toEqual([sale.id]);
    expect(byNumber.body[0]).toMatchObject({
      memberName: "Tomás",
      methods: ["cash"],
      totalCents: 1_290_000,
    });
    expect((await julian.get("/api/sales?status=voided")).body).toEqual([]);
    expect((await julian.get("/api/sales?method=debit")).body).toEqual([]);
    expect(
      (await tomas.get("/api/sales")).body.every(
        (s: { memberId: string }) => s.memberId === byNumber.body[0].memberId,
      ),
    ).toBe(true);
    const nico = await as(app(), ref.t.db, "nico");
    expect((await nico.get("/api/sales")).status).toBe(403);
  });
});
