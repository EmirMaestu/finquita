import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { products, stockMovements } from "../src/db/schema/index";
import { seedId } from "../src/seed/ids";
import { as, memberId } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { product } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });

describe("conteo de inventario", () => {
  it("se cuenta a ciegas y se aprueba con las diferencias en unidades y en plata", async () => {
    const julian = await as(app(), ref.t.db, "julian");
    const nico = await as(app(), ref.t.db, "nico");
    const created = await julian.post("/api/counts", {
      name: "Góndola 3, Infusiones",
      scope: "category",
      categoryId: seedId("category:infusiones"),
      assignedTo: memberId("nico"),
    });
    expect(created.status).toBe(201);
    expect(created.body.lines).toBe(1);
    const id = created.body.id;

    // Nico no ve el stock del sistema.
    const blind = await nico.get(`/api/counts/${id}`);
    expect(blind.body.lines[0]).toMatchObject({ name: "Yerba Playadito 1 kg", countedQty: null });
    expect(blind.body.lines[0].systemQty).toBeUndefined();
    expect(
      (await nico.put(`/api/counts/${id}/lines`, { productId: product("yerba"), countedQty: 2 }))
        .status,
    ).toBe(200);
    expect(
      (await nico.put(`/api/counts/${id}/lines`, { productId: product("coca"), countedQty: 2 }))
        .status,
    ).toBe(404);
    expect((await nico.post(`/api/counts/${id}/submit`)).status).toBe(200);
    // Terminado, ya no se cuenta.
    expect(
      (await nico.put(`/api/counts/${id}/lines`, { productId: product("yerba"), countedQty: 5 }))
        .status,
    ).toBe(409);

    const carlos = await as(app(), ref.t.db, "carlos");
    const review = await carlos.get(`/api/counts/${id}`);
    expect(review.body.lines[0]).toMatchObject({
      systemQty: 3,
      countedQty: 2,
      differenceQty: -1,
      differenceCents: -485_000,
    });
    // Nico no aprueba.
    expect((await nico.post(`/api/counts/${id}/approve`, {})).status).toBe(403);
    const ok = await carlos.post(`/api/counts/${id}/approve`, {});
    expect(ok.body).toEqual({ approved: 1, moved: 1 });
    const [yerba] = await ref.t.db
      .select()
      .from(products)
      .where(eq(products.id, product("yerba")));
    expect(yerba?.stockQty).toBe(2);
    const moves = await ref.t.db.select().from(stockMovements).where(eq(stockMovements.refId, id));
    expect(moves).toMatchObject([
      { kind: "count", qty: -1, resultingQty: 2, reason: "Góndola 3, Infusiones" },
    ]);
    const list = await carlos.get("/api/counts");
    expect(list.body[0]).toMatchObject({
      status: "approved",
      total: 1,
      counted: 1,
      assignedName: "Nico",
    });
  });

  it("el cajero no crea conteos", async () => {
    const tomas = await as(app(), ref.t.db, "tomas");
    expect((await tomas.post("/api/counts", { name: "X", scope: "all" })).status).toBe(403);
  });
});
