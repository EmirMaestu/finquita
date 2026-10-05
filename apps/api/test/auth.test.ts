import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { verifyMemberPin } from "../src/auth/pin";
import { members } from "../src/db/schema/index";
import { seedId } from "../src/seed/ids";
import { TEST_AUTH, TestClient } from "./helpers/client";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();

const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });
const TOMAS = seedId("member:tomas");
const JULIAN = seedId("member:julian");

/** El dueño crea su cuenta y habilita la Mac del mostrador. */
async function ownerWithDevice() {
  const a = app();
  const owner = new TestClient(a);
  const signUp = await owner.signUp("carlos@laesquina.example", "contraseña-larga", "Carlos Díaz");
  expect(signUp.status).toBe(200);
  const dev = await owner.post("/api/devices", { name: "Mac del mostrador", kind: "mac" });
  expect(dev.status).toBe(201);
  const mac = new TestClient(a);
  mac.deviceToken = dev.body.token;
  return { a, owner, mac };
}

describe("login con email y contraseña", () => {
  it("el dueño entra y la API sabe quién es", async () => {
    const a = app();
    const c = new TestClient(a);
    expect((await c.signUp("carlos@laesquina.example", "contraseña-larga", "Carlos")).status).toBe(
      200,
    );
    const fresh = new TestClient(a);
    expect((await fresh.get("/api/me")).status).toBe(401);
    expect((await fresh.signIn("carlos@laesquina.example", "otra-cosa")).status).toBe(401);
    expect((await fresh.signIn("carlos@laesquina.example", "contraseña-larga")).status).toBe(200);
    const me = await fresh.get("/api/me");
    expect(me.status).toBe(200);
    expect(me.body.member).toMatchObject({
      name: "Carlos Díaz",
      role: "owner",
      id: seedId("member:carlos"),
    });
    expect(me.body.via).toBe("password");
  });

  it("el encargado invitado puede crear su cuenta; alguien sin invitación no", async () => {
    const a = app();
    const julian = new TestClient(a);
    expect(
      (await julian.signUp("julian@laesquina.example", "contraseña-larga", "Julián")).status,
    ).toBe(200);
    expect((await julian.get("/api/me")).body.member).toMatchObject({
      id: JULIAN,
      role: "manager",
    });
    const extraño = new TestClient(a);
    const r = await extraño.signUp("nadie@example.com", "contraseña-larga", "Nadie");
    expect(r.status).toBe(403);
  });

  it("en una base vacía, la primera cuenta es la del dueño", async () => {
    await ref.t.reset();
    const c = new TestClient(app());
    expect((await c.signUp("duena@example.com", "contraseña-larga", "Ana")).status).toBe(200);
    expect((await c.get("/api/me")).body.member).toMatchObject({ name: "Ana", role: "owner" });
  });
});

describe("PIN en un dispositivo habilitado", () => {
  it("el PIN correcto abre una sesión para esa persona", async () => {
    const { mac } = await ownerWithDevice();
    const list = await mac.get("/api/pin/members");
    expect(list.body.map((m: { name: string }) => m.name)).toContain("Tomás");
    const r = await mac.post("/api/pin/login", { memberId: TOMAS, pin: "4567" });
    expect(r.status).toBe(200);
    mac.pinToken = r.body.token;
    const me = await mac.get("/api/me");
    expect(me.body).toMatchObject({ member: { name: "Tomás", role: "cashier" }, via: "pin" });
    expect(me.body.device.name).toBe("Mac del mostrador");
  });

  it("cambio rápido de usuario: otra persona entra con su PIN en el mismo dispositivo", async () => {
    const { mac } = await ownerWithDevice();
    mac.pinToken = (await mac.post("/api/pin/login", { memberId: TOMAS, pin: "4567" })).body.token;
    const lucia = await mac.post("/api/pin/login", {
      memberId: seedId("member:lucia"),
      pin: "3456",
    });
    mac.pinToken = lucia.body.token;
    expect((await mac.get("/api/me")).body.member.name).toBe("Lucía");
  });

  it("el PIN incorrecto no entra y dice cuántos intentos quedan", async () => {
    const { mac } = await ownerWithDevice();
    const r = await mac.post("/api/pin/login", { memberId: TOMAS, pin: "0000" });
    expect(r.status).toBe(401);
    expect(r.body.error).toMatchObject({ code: "pin_wrong", details: { attemptsLeft: 4 } });
    expect((await mac.get("/api/me")).status).toBe(401);
  });

  it("cinco intentos fallidos bloquean cinco minutos, aun con el PIN correcto", async () => {
    const { mac } = await ownerWithDevice();
    for (let i = 0; i < 4; i++) {
      expect((await mac.post("/api/pin/login", { memberId: TOMAS, pin: "1111" })).status).toBe(401);
    }
    const fifth = await mac.post("/api/pin/login", { memberId: TOMAS, pin: "1111" });
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe("pin_locked");
    const good = await mac.post("/api/pin/login", { memberId: TOMAS, pin: "4567" });
    expect(good.status).toBe(423);
    // Pasados los cinco minutos vuelve a entrar.
    const [m] = await ref.t.db.select().from(members).where(eq(members.id, TOMAS));
    const later = new Date((m?.pinLockedUntil?.getTime() ?? 0) + 1000);
    const r = await verifyMemberPin(ref.t.db, TOMAS, "4567", later);
    expect(r.ok).toBe(true);
  });

  it("un acierto reinicia el contador de intentos", async () => {
    await verifyMemberPin(ref.t.db, TOMAS, "1111");
    await verifyMemberPin(ref.t.db, TOMAS, "1111");
    expect((await verifyMemberPin(ref.t.db, TOMAS, "4567")).ok).toBe(true);
    const [m] = await ref.t.db.select().from(members).where(eq(members.id, TOMAS));
    expect(m?.pinFailedAttempts).toBe(0);
  });

  it("sin dispositivo habilitado no se puede entrar con PIN", async () => {
    const c = new TestClient(app());
    expect((await c.post("/api/pin/login", { memberId: TOMAS, pin: "4567" })).status).toBe(403);
    c.deviceToken = "inventado";
    expect((await c.post("/api/pin/login", { memberId: TOMAS, pin: "4567" })).status).toBe(403);
  });

  it("al revocar el dispositivo se cierran sus sesiones con PIN", async () => {
    const { owner, mac } = await ownerWithDevice();
    mac.pinToken = (await mac.post("/api/pin/login", { memberId: TOMAS, pin: "4567" })).body.token;
    const list = await owner.get("/api/devices");
    expect(list.body).toHaveLength(1);
    expect(list.body[0].tokenHash).toBeUndefined();
    expect((await owner.delete(`/api/devices/${list.body[0].id}`)).status).toBe(200);
    expect((await mac.get("/api/me")).status).toBe(401);
  });

  it("solo el dueño habilita dispositivos y carga PIN de otros", async () => {
    const { a } = await ownerWithDevice();
    const julian = new TestClient(a);
    await julian.signUp("julian@laesquina.example", "contraseña-larga", "Julián");
    expect((await julian.post("/api/devices", { name: "Otra" })).status).toBe(403);
    expect((await julian.put(`/api/members/${TOMAS}/pin`, { pin: "9999" })).status).toBe(403);
    expect((await julian.put(`/api/members/${JULIAN}/pin`, { pin: "9999" })).status).toBe(200);
  });

  it("el PIN tiene de 4 a 6 números", async () => {
    const { owner } = await ownerWithDevice();
    expect((await owner.put(`/api/members/${TOMAS}/pin`, { pin: "12" })).status).toBe(400);
    expect((await owner.put(`/api/members/${TOMAS}/pin`, { pin: "1234567" })).status).toBe(400);
    expect((await owner.put(`/api/members/${TOMAS}/pin`, { pin: "12ab" })).status).toBe(400);
    expect((await owner.put(`/api/members/${TOMAS}/pin`, { pin: "246810" })).status).toBe(200);
  });
});
