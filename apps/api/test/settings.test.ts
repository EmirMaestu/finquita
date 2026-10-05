import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { seedId } from "../src/seed/ids";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });

describe("ajustes", () => {
  it("medios de pago: el cambio se guarda mezclado, baja a los dispositivos y queda en Actividad", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const r = await carlos.put("/api/settings/payments", {
      methods: { credit: { surchargeBp: 1500 }, qr: { enabled: false } },
      alias: "almacen.esquina",
    });
    expect(r.status).toBe(200);
    expect(r.body.methods.credit).toEqual({ enabled: true, surchargeBp: 1500, feeBp: 180 });
    expect(r.body.methods.qr.enabled).toBe(false);
    expect(r.body.methods.debit.enabled).toBe(true);
    const pull = await carlos.get("/api/sync/pull?since=0&limit=5000");
    const pay = pull.body.changes.find(
      (ch: { entity: string; id: string }) => ch.entity === "settings" && ch.id === "payments",
    );
    expect(pay.data.value.methods.credit.surchargeBp).toBe(1500);
    const audit = await carlos.get("/api/audit?entityType=settings");
    expect(audit.body[0]).toMatchObject({ action: "settings.payments" });
    expect(audit.body[0].after.methods.credit.surchargeBp).toBe(1500);
    // Validaciones.
    expect(
      (await carlos.put("/api/settings/payments", { methods: { cash: { surchargeBp: 99999 } } }))
        .status,
    ).toBe(400);
    const off = { enabled: false };
    expect(
      (
        await carlos.put("/api/settings/payments", {
          methods: { cash: off, debit: off, credit: off, transfer: off, account: off },
        })
      ).status,
    ).toBe(409);
    expect((await carlos.put("/api/settings/nada", {})).status).toBe(404);
  });

  it("funciones, caja y precios", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    expect((await carlos.put("/api/settings/features", { promotions: true })).body).toEqual({
      promotions: true,
      lots: false,
      counts: false,
      multiRegister: false,
    });
    expect((await carlos.put("/api/settings/cash", { blindCount: false })).body.blindCount).toBe(
      false,
    );
    expect(
      (await carlos.put("/api/settings/pricing", { roundingCents: 10000 })).body.roundingCents,
    ).toBe(10000);
    expect((await carlos.put("/api/settings/pricing", { roundingCents: 3 })).status).toBe(400);
    const all = await carlos.get("/api/settings");
    expect(all.body.features.promotions).toBe(true);
    expect(all.body.invoicing).toEqual({ notifyWhenReady: false });
  });

  it("negocio, usuarios con permisos finos y cajas", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    expect(
      (await carlos.patch("/api/business", { cuit: "20-12345678-9", taxCondition: "monotributo" }))
        .body,
    ).toMatchObject({ cuit: "20-12345678-9", taxCondition: "monotributo" });
    expect((await carlos.patch("/api/business", { cuit: "123" })).status).toBe(400);
    // Invitar a una encargada: necesita email.
    expect((await carlos.post("/api/members", { name: "Paula", role: "manager" })).status).toBe(
      400,
    );
    const paula = await carlos.post("/api/members", {
      name: "Paula",
      role: "manager",
      email: "Paula@example.com",
      pin: "8642",
    });
    expect(paula.status).toBe(201);
    const list = (await carlos.get("/api/members")).body;
    expect(list.find((m: { name: string }) => m.name === "Paula")).toMatchObject({
      role: "manager",
      email: "paula@example.com",
      hasPin: true,
      hasAccount: false,
    });
    // Ver costos es opcional para el encargado; cobrar sobre el límite no se toca para el cajero.
    expect(
      (await carlos.put(`/api/members/${paula.body.id}/permissions`, { view_costs: "allow" }))
        .status,
    ).toBe(200);
    expect(
      (await carlos.get("/api/members")).body.find((m: { name: string }) => m.name === "Paula")
        .overrides,
    ).toEqual({ view_costs: "allow" });
    expect(
      (
        await carlos.put(`/api/members/${seedId("member:tomas")}/permissions`, {
          settings: "allow",
        })
      ).status,
    ).toBe(400);
    // Siempre queda un dueño.
    expect(
      (await carlos.patch(`/api/members/${seedId("member:carlos")}`, { active: false })).status,
    ).toBe(409);
    expect((await carlos.patch(`/api/members/${paula.body.id}`, { active: false })).status).toBe(
      200,
    );
    const caja2 = await carlos.post("/api/registers", { name: "Caja 2", toleranceCents: 100_000 });
    expect(caja2.status).toBe(201);
    expect(
      (await carlos.get("/api/registers")).body.map((r: { name: string }) => r.name),
    ).toContain("Caja 2");
  });

  it("exportar a CSV y solo el dueño entra", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const res = await app().request("http://localhost/api/export/products.csv", {
      headers: {
        "x-device-token": carlos.deviceToken ?? "",
        authorization: `Bearer ${carlos.pinToken}`,
      },
    });
    const text = await res.text();
    expect(text.split("\n")[0]).toContain(
      "nombre;codigo;codigo_interno;categoria;costo;precio;stock;minimo;unidad",
    );
    expect(text).toContain("Coca-Cola 2,25 L");
    const julian = await as(app(), ref.t.db, "julian");
    expect((await julian.get("/api/settings")).status).toBe(403);
    expect((await julian.put("/api/settings/features", { lots: true })).status).toBe(403);
  });
});
