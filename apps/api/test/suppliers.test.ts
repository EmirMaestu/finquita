import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { seedId } from "../src/seed/ids";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { product } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });

describe("proveedores", () => {
  it("lista con días, WhatsApp, saldo y último pedido", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const r = await carlos.get("/api/suppliers");
    expect(r.body).toHaveLength(6);
    const lacteos = r.body.find((s: { name: string }) => s.name === "Lácteos del Sur");
    expect(lacteos).toMatchObject({
      category: "Lácteos",
      orderDays: [2],
      deliveryDays: [4],
      whatsapp: "5492614000002",
      balanceCents: 18_450_000,
      channel: "whatsapp",
    });
    expect(lacteos.lastOrderAt).toBeTruthy();
    const total = r.body.reduce((s: number, x: { balanceCents: number }) => s + x.balanceCents, 0);
    expect(total).toBe(34_460_000);
  });

  it("CRUD: alta, edición, productos con código y costo, y baja", async () => {
    const julian = await as(app(), ref.t.db, "julian");
    const created = await julian.post("/api/suppliers", {
      name: "Golosinas Cuyo",
      category: "Kiosco",
      whatsapp: "+5492614000099",
      orderDays: [3],
      deliveryDays: [5],
      minOrderCents: 5_000_000,
      paymentTermsDays: 15,
    });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await julian.post("/api/suppliers", { name: "X", whatsapp: "261 400" })).status).toBe(
      400,
    );
    const patched = await julian.patch(`/api/suppliers/${id}`, {
      contactName: "Silvina",
      channel: "manual",
    });
    expect(patched.body).toMatchObject({
      contactName: "Silvina",
      channel: "manual",
      whatsapp: "5492614000099",
    });
    expect(
      (
        await julian.put(`/api/suppliers/${id}/products`, {
          productId: product("cigarrillos"),
          supplierCode: "GC-20",
          costCents: 410_000,
          packQty: 10,
        })
      ).status,
    ).toBe(200);
    const carlos = await as(app(), ref.t.db, "carlos");
    const ficha = await carlos.get(`/api/suppliers/${id}`);
    expect(ficha.body.products).toMatchObject([
      {
        name: "Cigarrillos atado x 20",
        supplierCode: "GC-20",
        costCents: 410_000,
        packQty: 10,
        barcode: "7790000005022",
      },
    ]);
    // El encargado no ve costos.
    expect((await julian.get(`/api/suppliers/${id}`)).body.products[0].costCents).toBeUndefined();
    expect(
      (await julian.delete(`/api/suppliers/${id}/products/${product("cigarrillos")}`)).status,
    ).toBe(200);
    expect((await julian.delete(`/api/suppliers/${id}`)).status).toBe(200);
    expect((await carlos.get(`/api/suppliers/${id}`)).status).toBe(404);
  });

  it("la ficha trae pedidos y facturas", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const r = await carlos.get(`/api/suppliers/${seedId("supplier:lacteos")}`);
    expect(r.body.orders[0]).toMatchObject({ number: 42, status: "draft", totalCents: 18_640_000 });
    expect(r.body.invoices[0]).toMatchObject({ amountCents: 18_450_000, status: "pending" });
    expect(r.body.products.length).toBe(14);
  });

  it("permisos: el cajero no edita; el repositor ve la lista", async () => {
    const tomas = await as(app(), ref.t.db, "tomas");
    expect((await tomas.post("/api/suppliers", { name: "X" })).status).toBe(403);
    const nico = await as(app(), ref.t.db, "nico");
    expect((await nico.get("/api/suppliers")).status).toBe(200);
  });
});
