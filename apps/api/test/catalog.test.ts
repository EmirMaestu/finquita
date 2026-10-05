import { newId } from "@mostrador/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { products, stockMovements } from "../src/db/schema/index";
import { seedId } from "../src/seed/ids";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { op, openShift, product, saleOf } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });
const cat = (k: string) => seedId(`category:${k}`);

describe("API de catálogo", () => {
  it("el dueño da de alta un producto con dos códigos y lo encuentra por cualquiera", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const r = await carlos.post("/api/products", {
      name: "Galletitas de agua 200 g",
      categoryId: cat("almacen"),
      priceCents: 150_000,
      costCents: 100_000,
      minStock: 6,
      barcodes: ["7790895000782", "7790895000799"],
      initialStock: 12,
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      name: "Galletitas de agua 200 g",
      costCents: 100_000,
      marginBp: 5000,
      stockQty: 12,
      stockState: "ok",
    });
    expect(r.body.barcodes.sort()).toEqual(["7790895000782", "7790895000799"]);
    expect((await carlos.get("/api/barcodes/7790895000799")).body.id).toBe(r.body.id);
    const moves = await ref.t.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, r.body.id));
    expect(moves).toMatchObject([{ qty: 12, reason: "Stock inicial" }]);
  });

  it("un código que ya es de otro producto se rechaza", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const r = await carlos.post("/api/products", {
      name: "Otra yerba",
      priceCents: 1,
      barcodes: ["7791234000012"],
    });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toContain("Yerba Playadito 1 kg");
    expect((await carlos.get("/api/barcodes/0000000000000")).status).toBe(404);
  });

  it("cambiar precio: el encargado sí, el cajero no, y queda en el historial", async () => {
    const julian = await as(app(), ref.t.db, "julian");
    const tomas = await as(app(), ref.t.db, "tomas");
    const denied = await tomas.patch(`/api/products/${product("yerba")}`, {
      changes: { priceCents: 1 },
    });
    expect(denied.status).toBe(403);
    const ok = await julian.patch(`/api/products/${product("yerba")}`, {
      changes: { priceCents: 720_000 },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.priceCents).toBe(720_000);
    // El encargado no ve costos por defecto.
    expect(ok.body).not.toHaveProperty("costCents");
    const carlos = await as(app(), ref.t.db, "carlos");
    const ficha = await carlos.get(`/api/products/${product("yerba")}`);
    expect(ficha.body.marginBp).toBe(4845);
    expect(ficha.body.history[0]).toMatchObject({
      action: "product.price_changed",
      before: { priceCents: 690_000 },
      after: { priceCents: 720_000 },
    });
    expect(ficha.body.suppliers[0]).toMatchObject({
      name: "Distribuidora Andina",
      supplierCode: "YPL-1K",
      costCents: 485_000,
    });
  });

  it("el repositor no da de alta productos por la API", async () => {
    const nico = await as(app(), ref.t.db, "nico");
    expect((await nico.post("/api/products", { name: "X", priceCents: 100 })).status).toBe(403);
    // Pero consulta precio y stock.
    const list = await nico.get("/api/products?q=yerba");
    expect(list.body.items[0]).toMatchObject({ name: "Yerba Playadito 1 kg", stockState: "low" });
  });

  it("lista con filtros: stock bajo, sin stock, por categoría y por proveedor", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const names = async (qs: string) =>
      (await carlos.get(`/api/products?${qs}`)).body.items.map((i: { name: string }) => i.name);
    expect(await names("filter=out")).toEqual(["Lavandina 1 L", "Leche entera 1 L sachet"]);
    expect(await names("filter=low")).toContain("Yerba Playadito 1 kg");
    expect(await names("filter=low")).not.toContain("Coca-Cola 2,25 L");
    expect(await names(`categoryId=${cat("fiambreria")}`)).toEqual([
      "Jamón cocido",
      "Queso cremoso",
    ]);
    expect(await names(`supplierId=${seedId("supplier:limpieza")}`)).toEqual(["Lavandina 1 L"]);
    expect(await names("filter=expiring")).toEqual(["Jamón cocido"]);
    expect(await names("q=1001")).toEqual(["Pan francés"]);
    const page = await carlos.get("/api/products?limit=5");
    expect(page.body).toMatchObject({ total: 26, hasMore: true });
  });

  it("presentaciones vinculadas comparten el stock: vender un maple descuenta 30 huevos", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const shiftId = newId();
    await mac.post("/api/sync/push", {
      deviceNow: new Date().toISOString(),
      ops: [openShift(shiftId), op("sale.create", saleOf(shiftId, [{ key: "maple" }]))],
    });
    const [huevo] = await ref.t.db
      .select()
      .from(products)
      .where(eq(products.id, product("huevo")));
    expect(huevo?.stockQty).toBe(90);
    const carlos = await as(app(), ref.t.db, "carlos");
    expect((await carlos.get(`/api/products/${product("maple")}`)).body.stockQty).toBe(3);
    expect((await carlos.get(`/api/products/${product("huevo")}`)).body.linked).toMatchObject([
      { name: "Huevos maple x 30", factor: 30 },
    ]);
    // Una presentación no puede apoyarse en otra presentación.
    const bad = await carlos.post("/api/products", {
      name: "Media docena",
      priceCents: 1,
      stockBaseId: product("maple"),
      stockBaseFactor: 0.2,
    });
    expect(bad.status).toBe(400);
  });

  it("servicios a comisión: no llevan stock", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const r = await carlos.post("/api/products", {
      name: "Recarga celular",
      kind: "service",
      priceCents: 0,
      commissionBp: 500,
    });
    expect(r.status).toBe(201);
    const mac = await as(app(), ref.t.db, "tomas");
    const shiftId = newId();
    const sale = saleOf(shiftId, [{ key: "coca" }]);
    sale.lines.push({
      id: newId(),
      kind: "product",
      productId: r.body.id,
      description: "Recarga celular",
      qty: 1,
      unit: "unit",
      unitPriceCents: 500_000,
      discountCents: 0,
      totalCents: 500_000,
    });
    sale.subtotalCents += 500_000;
    sale.totalCents += 500_000;
    const firstPayment = sale.payments[0];
    if (firstPayment) {
      firstPayment.amountCents += 500_000;
      firstPayment.tenderedCents = firstPayment.amountCents;
    }
    const res = await mac.post("/api/sync/push", {
      deviceNow: new Date().toISOString(),
      ops: [openShift(shiftId), op("sale.create", sale)],
    });
    expect(res.body.results[1].status).toBe("applied");
    expect(
      await ref.t.db.select().from(stockMovements).where(eq(stockMovements.productId, r.body.id)),
    ).toHaveLength(0);
  });

  it("envase retornable: el producto apunta a su envase, que se vende aparte", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const envase = await carlos.post("/api/products", {
      name: "Envase cerveza 1 L",
      priceCents: 80_000,
    });
    const birra = await carlos.post("/api/products", {
      name: "Cerveza 1 L retornable",
      priceCents: 250_000,
      containerProductId: envase.body.id,
    });
    expect(birra.status).toBe(201);
    expect(birra.body.containerProductId).toBe(envase.body.id);
  });

  it("baja de producto: deja de aparecer, el historial queda", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    expect((await carlos.delete(`/api/products/${product("lavandina")}`)).status).toBe(200);
    expect((await carlos.get(`/api/products/${product("lavandina")}`)).status).toBe(404);
    expect((await carlos.get("/api/products?q=lavandina")).body.items).toEqual([]);
    const tomas = await as(app(), ref.t.db, "tomas");
    expect((await tomas.delete(`/api/products/${product("coca")}`)).status).toBe(403);
  });

  it("códigos: agregar y quitar", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    expect(
      (await carlos.post(`/api/products/${product("coca")}/barcodes`, { code: "7790000001024" }))
        .status,
    ).toBe(201);
    expect((await carlos.get("/api/barcodes/7790000001024")).body.name).toBe("Coca-Cola 2,25 L");
    expect(
      (await carlos.post(`/api/products/${product("yerba")}/barcodes`, { code: "7790000001024" }))
        .status,
    ).toBe(409);
    expect(
      (await carlos.delete(`/api/products/${product("coca")}/barcodes/7790000001024`)).status,
    ).toBe(200);
    expect((await carlos.get("/api/barcodes/7790000001024")).status).toBe(404);
  });

  it("precio fijo y chips: sin costo, pierde plata", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const cig = await carlos.get(`/api/products/${product("cigarrillos")}`);
    expect(cig.body).toMatchObject({ fixedPrice: true, ageRestricted: true });
    const loss = await carlos.patch(`/api/products/${product("fideos")}`, {
      changes: { priceCents: 100_000 },
    });
    expect(loss.body.chips).toContain("losing_money");
    const nuevo = await carlos.post("/api/products", { name: "Sin costo", priceCents: 100 });
    expect(nuevo.body.chips).toEqual(["needs_review", "no_cost"]);
  });

  it("categorías: árbol de dos niveles con permisos", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const tree = await carlos.get("/api/categories");
    const almacen = tree.body.find((c: { name: string }) => c.name === "Almacén");
    expect(almacen.children.map((c: { name: string }) => c.name)).toEqual([
      "Infusiones",
      "Aceites",
      "Pastas",
    ]);
    const nueva = await carlos.post("/api/categories", {
      name: "Galletitas",
      parentId: cat("almacen"),
      defaultMarginBp: 4500,
    });
    expect(nueva.status).toBe(201);
    // No hay tercer nivel.
    expect(
      (await carlos.post("/api/categories", { name: "De agua", parentId: nueva.body.id })).status,
    ).toBe(409);
    expect(
      (await carlos.patch(`/api/categories/${nueva.body.id}`, { defaultMarginBp: 5000 })).body
        .defaultMarginBp,
    ).toBe(5000);
    expect((await carlos.delete(`/api/categories/${cat("infusiones")}`)).status).toBe(409);
    expect((await carlos.delete(`/api/categories/${nueva.body.id}`)).status).toBe(200);
    const tomas = await as(app(), ref.t.db, "tomas");
    expect((await tomas.post("/api/categories", { name: "X" })).status).toBe(403);
  });
});
