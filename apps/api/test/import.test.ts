import { readFileSync } from "node:fs";
import { parseCsv, readXlsx, writeXlsx } from "@mostrador/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { auditLog, barcodes, categories, products, supplierProducts } from "../src/db/schema/index";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { product } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });
const csv = readFileSync(new URL("./fixtures/lista-productos.csv", import.meta.url), "utf8");
const mapping = {
  name: 0,
  barcode: 1,
  cost: 2,
  price: 3,
  category: 4,
  stock: 5,
  minStock: 6,
  supplier: 7,
};

describe("importar productos", () => {
  it("vista previa: nuevos, actualizados y con error, sin cambiar nada", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const r = await carlos.post("/api/import/products/preview", { rows: parseCsv(csv), mapping });
    expect(r.status).toBe(200);
    expect(r.body.summary).toEqual({ new: 3, updated: 1, unchanged: 1, errors: 2 });
    const yerba = r.body.items.find((i: { line: number }) => i.line === 4);
    expect(yerba).toMatchObject({
      action: "update",
      productId: product("yerba"),
      changes: { priceCents: [690_000, 720_000] },
    });
    const errs = r.body.items.filter((i: { action: string }) => i.action === "error");
    expect(errs.map((e: { errors: string[] }) => e.errors[0])).toEqual([
      "Falta el precio",
      "El código 7790895000782 está repetido (fila 2)",
    ]);
    expect(
      await ref.t.db.select().from(products).where(eq(products.name, "Galletitas de agua 200 g")),
    ).toHaveLength(0);
  });

  it("importa el archivo de ejemplo (como Excel) y aplica todo junto", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    // El mismo archivo guardado como .xlsx.
    const rows = await readXlsx(writeXlsx(parseCsv(csv)));
    const r = await carlos.post("/api/import/products/confirm", { rows, mapping });
    expect(r.status).toBe(200);
    expect(r.body.summary).toEqual({ new: 3, updated: 1, unchanged: 1, errors: 2 });

    const [gall] = await ref.t.db
      .select()
      .from(products)
      .where(eq(products.name, "Galletitas de agua 200 g"));
    expect(gall).toMatchObject({
      priceCents: 150_000,
      costCents: 100_000,
      marginBp: 5000,
      stockQty: 12,
      minStock: 6,
    });
    const [code] = await ref.t.db.select().from(barcodes).where(eq(barcodes.code, "7790895000782"));
    expect(code?.productId).toBe(gall?.id);
    // La subcategoría "Galletitas" se creó adentro de Almacén.
    const [cat] = await ref.t.db
      .select()
      .from(categories)
      .where(eq(categories.id, gall?.categoryId ?? ""));
    expect(cat?.name).toBe("Galletitas");
    expect(cat?.parentId).toBeTruthy();
    // Se vinculó al proveedor que existe.
    const links = await ref.t.db
      .select()
      .from(supplierProducts)
      .where(eq(supplierProducts.productId, gall?.id ?? ""));
    expect(links).toHaveLength(1);

    const [yerba] = await ref.t.db
      .select()
      .from(products)
      .where(eq(products.id, product("yerba")));
    expect(yerba).toMatchObject({ priceCents: 720_000, stockQty: 3 });
    const log = await ref.t.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "product.imported"));
    expect(log).toHaveLength(1);
  });

  it("solo el dueño o el encargado importan", async () => {
    const tomas = await as(app(), ref.t.db, "tomas");
    expect(
      (await tomas.post("/api/import/products/preview", { rows: parseCsv(csv), mapping })).status,
    ).toBe(403);
  });
});
