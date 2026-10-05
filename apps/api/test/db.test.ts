import { newId } from "@mostrador/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { businesses } from "../src/db/schema";
import { createTestDb, type TestDb } from "./db";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.reset();
});

describe("base de datos", () => {
  it("se conecta y tiene las migraciones aplicadas", async () => {
    await t.db.insert(businesses).values({ id: newId(), name: "Almacén La Esquina" });
    const rows = await t.db.select().from(businesses);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Almacén La Esquina");
  });

  it("arranca vacía en cada test", async () => {
    const rows = await t.db.select().from(businesses);
    expect(rows).toHaveLength(0);
  });
});
