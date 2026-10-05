import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createTestDb, type TestDb } from "./db";
import { TEST_AUTH, TestClient } from "./helpers/client";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

type Step = { key: string; done: boolean };

describe("primer uso (base vacía)", () => {
  it("crear la cuenta, cargar el negocio y ver la checklist de primeros pasos", async () => {
    const app = createApp({ db: t.db, auth: TEST_AUTH });
    const owner = new TestClient(app);
    expect(
      (await owner.signUp("ana@almacen.example", "contraseña-larga", "Ana Pérez")).status,
    ).toBe(200);
    const me = await owner.get("/api/me");
    expect(me.body).toMatchObject({
      setupNeeded: true,
      member: { name: "Ana Pérez", role: "owner" },
    });

    const s0 = await owner.get("/api/setup/status");
    expect(s0.body).toMatchObject({ done: 0, total: 7, hasSales: false, dismissed: false });

    expect(
      (await owner.post("/api/setup/business", { name: "Almacén Don Pepe", city: "Maipú" })).status,
    ).toBe(201);
    expect((await owner.post("/api/setup/business", { name: "Otro" })).status).toBe(409);
    expect((await owner.get("/api/me")).body).toMatchObject({
      setupNeeded: false,
      business: { name: "Almacén Don Pepe", city: "Maipú" },
    });
    // Queda la Caja 1 para abrir el primer turno.
    expect((await owner.get("/api/registers")).body).toMatchObject([{ name: "Caja 1", number: 1 }]);

    await owner.put("/api/settings/payments", { alias: "don.pepe.mp" });
    const s1 = await owner.get("/api/setup/status");
    expect(s1.body.done).toBe(2);
    expect((s1.body.steps as Step[]).filter((x) => x.done).map((x) => x.key)).toEqual([
      "business",
      "payments",
    ]);

    expect((await owner.post("/api/setup/dismiss", {})).status).toBe(200);
    expect((await owner.get("/api/setup/status")).body.dismissed).toBe(true);
  });
});
