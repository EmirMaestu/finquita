import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { auditLog, products } from "../src/db/schema/index";
import { seedId } from "../src/seed/ids";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { product } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });

describe("cambio masivo de precios", () => {
  it("aplica +7 % a una categoría, redondea y deja afuera los de precio fijo", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const body = {
      categoryId: seedId("category:almacen"),
      mode: "price_pct",
      percentBp: 700,
      roundingCents: 5000,
    };
    const preview = await carlos.post("/api/prices/preview", body);
    expect(preview.status).toBe(200);
    const byName = (n: string) => preview.body.rows.find((r: { name: string }) => r.name === n);
    expect(byName("Yerba Playadito 1 kg")).toMatchObject({
      beforeCents: 690_000,
      afterCents: 740_000,
    });
    expect(byName("Aceite de girasol 1,5 L")).toMatchObject({
      beforeCents: 540_000,
      afterCents: 580_000,
    });
    expect(byName("Fideos tirabuzón 500 g")).toMatchObject({
      beforeCents: 190_000,
      afterCents: 205_000,
    });
    expect(preview.body.summary.changed).toBe(3);
    // La vista previa no cambia nada.
    const [y0] = await ref.t.db
      .select()
      .from(products)
      .where(eq(products.id, product("yerba")));
    expect(y0?.priceCents).toBe(690_000);

    const applied = await carlos.post("/api/prices/apply", body);
    expect(applied.body.changedIds).toHaveLength(3);
    const after = await ref.t.db
      .select()
      .from(products)
      .where(inArray(products.id, applied.body.changedIds));
    expect(after.map((p) => p.priceCents).sort((a, b) => a - b)).toEqual([
      205_000, 580_000, 740_000,
    ]);
    expect(after.find((p) => p.id === product("yerba"))?.marginBp).toBe(5258);
    const log = await ref.t.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "product.price_changed"));
    expect(log).toHaveLength(3);
  });

  it("el de precio fijo (cigarrillos) no cambia aunque esté en la selección", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const r = await carlos.post("/api/prices/apply", {
      categoryId: seedId("category:kiosco"),
      mode: "price_pct",
      percentBp: 700,
      roundingCents: 5000,
    });
    expect(r.body.changedIds).toEqual([]);
    expect(r.body.summary.skipped).toBe(1);
    const [cig] = await ref.t.db
      .select()
      .from(products)
      .where(eq(products.id, product("cigarrillos")));
    expect(cig?.priceCents).toBe(470_000);
  });

  it("solo dueño o encargado", async () => {
    const tomas = await as(app(), ref.t.db, "tomas");
    expect(
      (
        await tomas.post("/api/prices/preview", {
          mode: "price_pct",
          percentBp: 700,
          roundingCents: 5000,
        })
      ).status,
    ).toBe(403);
  });
});
