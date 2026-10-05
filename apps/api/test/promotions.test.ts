import { newId } from "@mostrador/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { lots, products, saleLines, stockMovements } from "../src/db/schema/index";
import { seedId } from "../src/seed/ids";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { op, openShift, product, REGISTER } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });

describe("promociones", () => {
  it("se cargan, bajan a los dispositivos y una venta con línea de promo se registra", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const r = await carlos.post("/api/promotions", {
      name: "2×1 Coca",
      kind: "two_for_one",
      products: [{ productId: product("coca") }],
    });
    expect(r.status).toBe(201);
    const list = await carlos.get("/api/promotions");
    expect(list.body[0]).toMatchObject({
      name: "2×1 Coca",
      kind: "two_for_one",
      products: [{ productId: product("coca"), qty: 1, name: "Coca-Cola 2,25 L" }],
    });
    const pull = await carlos.get("/api/sync/pull?since=0&limit=5000");
    expect(
      pull.body.changes.find((c: { entity: string }) => c.entity === "promotions")?.data,
    ).toMatchObject({ kind: "two_for_one", products: [{ productId: product("coca"), qty: 1 }] });

    // Venta de 2 Coca-Cola con la promo: paga una.
    const tomas = await as(app(), ref.t.db, "tomas");
    const shiftId = newId();
    const saleId = newId();
    const push = await tomas.post("/api/sync/push", {
      deviceNow: new Date().toISOString(),
      ops: [
        openShift(shiftId),
        op("sale.create", {
          id: saleId,
          registerId: REGISTER,
          shiftId,
          number: 900,
          customerId: null,
          lines: [
            {
              id: newId(),
              kind: "product",
              productId: product("coca"),
              description: "Coca-Cola 2,25 L",
              qty: 2,
              unit: "unit",
              unitPriceCents: 460_000,
              discountCents: 0,
              totalCents: 920_000,
            },
            {
              id: newId(),
              kind: "promo",
              productId: null,
              description: "Promo 2×1 Coca-Cola 2,25 L",
              qty: 1,
              unit: "unit",
              unitPriceCents: -460_000,
              discountCents: 0,
              totalCents: -460_000,
              promotionId: r.body.id,
            },
          ],
          payments: [
            {
              id: newId(),
              method: "cash",
              amountCents: 460_000,
              surchargeCents: 0,
              verified: false,
            },
          ],
          subtotalCents: 460_000,
          discountCents: 0,
          surchargeCents: 0,
          totalCents: 460_000,
          changeCents: 0,
          receiptType: "ticket",
        }),
      ],
    });
    expect(push.body.results.map((x: { status: string }) => x.status)).toEqual([
      "applied",
      "applied",
    ]);
    const lines = await ref.t.db.select().from(saleLines).where(eq(saleLines.saleId, saleId));
    expect(lines.find((l) => l.kind === "promo")).toMatchObject({ totalCents: -460_000 });
    const [coca] = await ref.t.db
      .select()
      .from(products)
      .where(eq(products.id, product("coca")));
    expect(coca?.stockQty).toBe(12);
  });
});

describe("vencimientos", () => {
  it("lista lo que vence y da de baja un lote como merma", async () => {
    const julian = await as(app(), ref.t.db, "julian");
    const within = await julian.get("/api/lots?within=7");
    expect(within.body).toMatchObject([{ productName: "Jamón cocido", qtyRemaining: 2.15 }]);
    const r = await julian.post(`/api/lots/${seedId("lot:jamon")}/remove`, { action: "waste" });
    expect(r.body).toEqual({ removed: 2.15 });
    const [jamon] = await ref.t.db
      .select()
      .from(products)
      .where(eq(products.id, product("jamon")));
    expect(jamon?.stockQty).toBe(0);
    const [lot] = await ref.t.db
      .select()
      .from(lots)
      .where(eq(lots.id, seedId("lot:jamon")));
    expect(lot?.qtyRemaining).toBe(0);
    const moves = await ref.t.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.lotId, seedId("lot:jamon")));
    expect(moves).toMatchObject([{ kind: "waste", qty: -2.15 }]);
    expect((await julian.get("/api/lots?within=7")).body).toEqual([]);
  });
});
