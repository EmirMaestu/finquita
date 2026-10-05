import { newId, todayAR } from "@mostrador/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createDb } from "../src/db/client";
import { barcodes, products } from "../src/db/schema/index";
import { as } from "./helpers/actors";
import type { TestClient } from "./helpers/client";
import { TEST_AUTH } from "./helpers/client";
import { product } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

// El escenario con fecha de hoy: lo vencido se calcula contra la fecha real.
const ref = useSeededDb({ today: todayAR() });
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });

type Change = { entity: string; id: string; op: string; data?: Record<string, unknown> };

/** Baja todo hasta que no haya más páginas. */
async function pullAll(c: TestClient, since = "0", limit = 1000) {
  const changes: Change[] = [];
  let cursor = since;
  for (let i = 0; i < 50; i++) {
    const r = await c.get(`/api/sync/pull?since=${cursor}&limit=${limit}`);
    expect(r.status).toBe(200);
    changes.push(...r.body.changes);
    cursor = r.body.cursor;
    if (!r.body.hasMore) break;
  }
  return { changes, cursor };
}

describe("GET /api/sync/pull", () => {
  it("la primera vez baja el catálogo completo, clientes y ajustes", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const { changes } = await pullAll(mac);
    const count = (e: string) => changes.filter((c) => c.entity === e).length;
    expect(count("products")).toBe(26);
    expect(count("barcodes")).toBe(21);
    expect(count("customers")).toBe(5);
    expect(count("settings")).toBe(3);
    expect(count("members")).toBe(5);
    const tomas = changes.find((c) => c.entity === "members" && c.data?.name === "Tomás");
    expect(tomas?.data).toEqual({
      id: tomas?.id,
      name: "Tomás",
      role: "cashier",
      active: true,
      hasPin: true,
    });
  });

  it("con el cursor baja solo lo que cambió después", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const { cursor } = await pullAll(mac);
    const empty = await mac.get(`/api/sync/pull?since=${cursor}`);
    expect(empty.body.changes).toEqual([]);
    await ref.t.db
      .update(products)
      .set({ priceCents: 720_000 })
      .where(eq(products.id, product("yerba")));
    const r = await mac.get(`/api/sync/pull?since=${empty.body.cursor}`);
    expect(r.body.changes).toHaveLength(1);
    expect(r.body.changes[0]).toMatchObject({
      entity: "products",
      id: product("yerba"),
      op: "upsert",
      data: { priceCents: 720_000 },
    });
    const after = await mac.get(`/api/sync/pull?since=${r.body.cursor}`);
    expect(after.body.changes).toEqual([]);
  });

  it("pagina sin perder ni repetir cambios", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const all = await pullAll(mac);
    const paged = await pullAll(mac, "0", 7);
    const ids = (cs: Change[]) => new Set(cs.map((c) => `${c.entity}:${c.id}`));
    const a = ids(all.changes);
    const p = ids(paged.changes);
    expect(p).toEqual(a);
  });

  it("marca las bajas: producto dado de baja y código borrado", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const { cursor } = await pullAll(mac);
    await ref.t.db
      .update(products)
      .set({ deletedAt: new Date() })
      .where(eq(products.id, product("lavandina")));
    const [code] = await ref.t.db.select().from(barcodes).where(eq(barcodes.code, "7790000003028"));
    await ref.t.db.delete(barcodes).where(eq(barcodes.code, "7790000003028"));
    const r = await mac.get(`/api/sync/pull?since=${cursor}`);
    expect(r.body.changes).toEqual(
      expect.arrayContaining([
        { entity: "products", id: product("lavandina"), op: "delete" },
        { entity: "barcodes", id: code?.id, op: "delete" },
      ]),
    );
  });

  it("no entrega cambios de una transacción que todavía no confirmó", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const { cursor } = await pullAll(mac);
    // Otra conexión abre una transacción, cambia un producto y no confirma todavía.
    const other = createDb(ref.t.url, { max: 1 });
    let release: () => void = () => {};
    const held = new Promise<void>((r) => {
      release = r;
    });
    let changed: () => void = () => {};
    const didChange = new Promise<void>((r) => {
      changed = r;
    });
    const slow = other.sql.begin(async (tx) => {
      await tx`update products set price_cents = 1 where id = ${product("coca")}`;
      changed();
      await held;
    });
    await didChange;
    // Mientras tanto, otra transacción confirma un cambio.
    await ref.t.db
      .update(products)
      .set({ priceCents: 210_000 })
      .where(eq(products.id, product("fideos")));
    const mid = await mac.get(`/api/sync/pull?since=${cursor}`);
    expect(mid.body.changes.map((c: Change) => c.id)).not.toContain(product("coca"));
    release();
    await slow;
    await other.sql.end();
    const next = await pullAll(mac, mid.body.cursor);
    expect(next.changes.map((c) => c.id)).toContain(product("coca"));
  });

  it("el cajero no recibe costos; el dueño sí", async () => {
    const tomas = await as(app(), ref.t.db, "tomas");
    const carlos = await as(app(), ref.t.db, "carlos");
    const find = (cs: Change[]) => cs.find((c) => c.id === product("yerba"))?.data;
    const t = find((await pullAll(tomas)).changes);
    const o = find((await pullAll(carlos)).changes);
    expect(t).toMatchObject({ priceCents: 690_000 });
    expect(t).not.toHaveProperty("costCents");
    expect(o).toMatchObject({ costCents: 485_000, marginBp: 4227 });
  });

  it("lo que aplica un push también baja en el pull", async () => {
    const mac = await as(app(), ref.t.db, "julian");
    const { cursor } = await pullAll(mac);
    const id = newId();
    await mac.post("/api/sync/push", {
      deviceNow: new Date().toISOString(),
      ops: [
        {
          opId: newId(),
          type: "product.upsert",
          memberId: (await mac.get("/api/me")).body.member.id,
          deviceAt: new Date().toISOString(),
          payload: {
            id,
            changes: { name: "Galletitas", priceCents: 150_000 },
            barcodes: ["7790895000782"],
          },
        },
      ],
    });
    const r = await pullAll(mac, cursor);
    expect(r.changes.map((c) => c.entity).sort()).toEqual(["barcodes", "products"]);
  });
});

describe("clientes en el pull", () => {
  it("bajan con su deuda vencida, para fiar sin conexión", async () => {
    const mac = await as(app(), ref.t.db, "tomas");
    const { changes } = await pullAll(mac);
    const byName = (n: string) =>
      changes.find((c) => c.entity === "customers" && c.data?.name === n)?.data;
    expect(byName("El Tano (obra)")).toMatchObject({
      balanceCents: 4_210_000,
      overdueCents: 4_210_000,
    });
    expect(byName("Familia Ortiz")).toMatchObject({ balanceCents: 780_000, overdueCents: 160_000 });
    expect(byName("Rosa Giménez")).toMatchObject({ balanceCents: 1_840_000, overdueCents: 0 });
  });
});
