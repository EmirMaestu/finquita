// apps/api/test/admin.test.ts
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdminConfig } from "../src/admin/session";
import { listBackups, systemStatus } from "../src/admin/status";
import { AdminError, listUsers, resetPassword, resetPin } from "../src/admin/users";
import { createApp } from "../src/app";
import { verifyMemberPin } from "../src/auth/pin";
import { auditLog, authAccount, authSession, members, pinSessions } from "../src/db/schema/index";
import { memberId } from "./helpers/actors";
import { TEST_AUTH, TestClient } from "./helpers/client";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "mostrador-backups-"));
  await writeFile(join(dir, "mostrador-2026-10-04.dump"), "copia-vieja");
  await writeFile(join(dir, "mostrador-2026-10-05.dump"), "copia-nueva!");
  await writeFile(join(dir, "otra-cosa.txt"), "no es una copia");
  await utimes(join(dir, "mostrador-2026-10-05.dump"), new Date(), new Date());
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const cfg = (): AdminConfig => ({
  password: "una-contraseña-de-admin-larga",
  secret: "secreto-de-test-con-largo-suficiente-1234",
  origin: "http://localhost:5173",
  backupsDir: dir,
  version: "abc1234",
  secure: false,
  startedAt: new Date("2026-10-06T12:00:00Z"),
});

describe("copias", () => {
  it("lista solo las copias, de la más nueva a la más vieja", async () => {
    const list = await listBackups(dir);
    expect(list.map((b) => b.name)).toEqual([
      "mostrador-2026-10-05.dump",
      "mostrador-2026-10-04.dump",
    ]);
    expect(list[0]?.size).toBe(12);
  });

  it("si la carpeta no existe, no hay copias", async () => {
    expect(await listBackups(join(dir, "no-existe"))).toEqual([]);
  });
});

describe("estado del sistema", () => {
  it("junta versión, base, worker, disco y última copia", async () => {
    const s = await systemStatus(ref.t.db, cfg());
    expect(s.version).toBe("abc1234");
    expect(s.db.ok).toBe(true);
    expect(s.db.sizeBytes).toBeGreaterThan(0);
    // En los tests no corre pg-boss: no hay última corrida y se marca como atrasado.
    expect(s.worker.lastRun).toBeNull();
    expect(s.worker.stale).toBe(true);
    expect(s.lastBackup?.name).toBe("mostrador-2026-10-05.dump");
    expect(s.backupStale).toBe(false);
  });
});

/** El dueño crea su cuenta (el seed no trae contraseñas) y queda con una sesión abierta. */
async function ownerWithSession() {
  const c = new TestClient(createApp({ db: ref.t.db, auth: TEST_AUTH }));
  const r = await c.signUp("carlos@laesquina.example", "contraseña-larga", "Carlos Díaz");
  expect(r.status).toBe(200);
  const carlos = (await listUsers(ref.t.db)).find((u) => u.id === memberId("carlos"));
  expect(carlos?.lastLogin).toBeInstanceOf(Date);
  const [m] = await ref.t.db
    .select()
    .from(members)
    .where(eq(members.id, memberId("carlos")));
  return m?.authUserId as string;
}

describe("usuarios", () => {
  it("lista al equipo con el dueño primero", async () => {
    const users = await listUsers(ref.t.db);
    expect(users[0]).toMatchObject({ name: expect.any(String), role: "owner" });
    expect(users.map((u) => u.id)).toContain(memberId("lucia"));
    const lucia = users.find((u) => u.id === memberId("lucia"));
    expect(lucia).toMatchObject({ hasPin: true, hasAccount: false, lastLogin: null });
  });

  it("resetear la contraseña del dueño cambia la clave, cierra sesiones y audita", async () => {
    const userId = await ownerWithSession();
    expect(
      (await ref.t.db.select().from(authSession).where(eq(authSession.userId, userId))).length,
    ).toBeGreaterThan(0);

    const temp = await resetPassword(ref.t.db, memberId("carlos"));
    expect(temp).toMatch(/^[A-Za-z0-9]{12}$/);

    const [acc] = await ref.t.db
      .select()
      .from(authAccount)
      .where(and(eq(authAccount.userId, userId), eq(authAccount.providerId, "credential")));
    expect(await verifyPassword({ hash: acc?.password ?? "", password: temp })).toBe(true);
    expect(await verifyPassword({ hash: acc?.password ?? "", password: "contraseña-larga" })).toBe(
      false,
    );
    expect(await ref.t.db.select().from(authSession).where(eq(authSession.userId, userId))).toEqual(
      [],
    );

    const [a] = await ref.t.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "admin.reset_password"));
    expect(a).toMatchObject({ entityId: memberId("carlos"), note: "Soporte (panel de admin)" });
    expect(JSON.stringify(a)).not.toContain(temp);

    // Con la temporal se puede entrar de verdad.
    const fresh = new TestClient(createApp({ db: ref.t.db, auth: TEST_AUTH }));
    expect((await fresh.signIn("carlos@laesquina.example", temp)).status).toBe(200);
  });

  it("no resetea la contraseña de quien no tiene cuenta", async () => {
    await expect(resetPassword(ref.t.db, memberId("lucia"))).rejects.toBeInstanceOf(AdminError);
  });

  it("resetear el PIN cambia el PIN, destraba el bloqueo y audita", async () => {
    const id = memberId("lucia");
    await ref.t.db
      .update(members)
      .set({ pinFailedAttempts: 5, pinLockedUntil: new Date(Date.now() + 60_000) })
      .where(eq(members.id, id));

    await resetPin(ref.t.db, id, "9876");

    expect((await verifyMemberPin(ref.t.db, id, "9876")).ok).toBe(true);
    const [m] = await ref.t.db.select().from(members).where(eq(members.id, id));
    expect(m).toMatchObject({ pinFailedAttempts: 0, pinLockedUntil: null });
    expect(await ref.t.db.select().from(pinSessions).where(eq(pinSessions.memberId, id))).toEqual(
      [],
    );
    const [a] = await ref.t.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "admin.reset_pin"));
    expect(a).toMatchObject({ entityId: id });
    expect(JSON.stringify(a)).not.toContain("9876");
  });

  it("rechaza un PIN que no tiene de 4 a 6 números", async () => {
    await expect(resetPin(ref.t.db, memberId("lucia"), "12a4")).rejects.toBeInstanceOf(AdminError);
    await expect(resetPin(ref.t.db, memberId("lucia"), "123")).rejects.toBeInstanceOf(AdminError);
  });
});

const ADMIN_PW = "una-contraseña-de-admin-larga";

function adminApp(password: string | null = ADMIN_PW) {
  return createApp({
    db: ref.t.db,
    auth: TEST_AUTH,
    admin: { password, backupsDir: dir, version: "abc1234" },
  });
}

async function loggedIn() {
  const c = new TestClient(adminApp());
  const r = await c.form("/api/admin/login", { password: ADMIN_PW });
  expect(r.status).toBe(302);
  expect(r.location).toBe("/api/admin");
  return c;
}

describe("rutas del panel", () => {
  it("sin ADMIN_PASSWORD el panel no existe", async () => {
    const c = new TestClient(adminApp(null));
    expect((await c.get("/api/admin")).status).toBe(404);
    expect((await c.get("/api/admin/login")).status).toBe(404);
  });

  it("sin sesión manda al login", async () => {
    const c = new TestClient(adminApp());
    expect((await c.get("/api/admin")).status).toBe(302);
    expect((await c.get("/api/admin/login")).body).toContain("Panel de soporte");
  });

  it("contraseña mala da 401; la buena entra y muestra el panel", async () => {
    const c = new TestClient(adminApp());
    expect((await c.form("/api/admin/login", { password: "mala" })).status).toBe(401);
    const ok = await loggedIn();
    const page = await ok.get("/api/admin");
    expect(page.status).toBe(200);
    expect(page.body).toContain("Estado del sistema");
    expect(page.body).toContain("abc1234");
    expect(page.body).toContain("mostrador-2026-10-05.dump");
  });

  it("después de cinco fallos, el sexto intento da 429 aunque la contraseña sea buena", async () => {
    const c = new TestClient(adminApp());
    for (let i = 0; i < 5; i++) {
      expect((await c.form("/api/admin/login", { password: "mala" })).status).toBe(401);
    }
    expect((await c.form("/api/admin/login", { password: ADMIN_PW })).status).toBe(429);
  });

  it("diez intentos en paralelo: solo cinco llegan a comparar, el resto da 429", async () => {
    const c = new TestClient(adminApp());
    const rs = await Promise.all(
      Array.from({ length: 10 }, () => c.form("/api/admin/login", { password: "mala" })),
    );
    expect(rs.filter((r) => r.status === 401)).toHaveLength(5);
    expect(rs.filter((r) => r.status === 429)).toHaveLength(5);
  });

  it("un id de persona mal formado da 400 y no un 500", async () => {
    const c = await loggedIn();
    const r = await c.form("/api/admin/users/not-a-uuid/pin", { pin: "1111" });
    expect(r.status).toBe(400);
  });

  it("un formulario desde otro origen da 403", async () => {
    const c = await loggedIn();
    const r = await c.form(
      `/api/admin/users/${memberId("lucia")}/pin`,
      { pin: "1111" },
      "https://otro-sitio.example",
    );
    expect(r.status).toBe(403);
  });

  it("una cookie adulterada vuelve al login", async () => {
    const c = await loggedIn();
    c.cookies.set("mostrador_admin", "9999999999999.firma-falsa");
    const r = await c.form(`/api/admin/users/${memberId("lucia")}/pin`, { pin: "1111" });
    expect(r.status).toBe(302);
    expect(r.location).toBe("/api/admin/login");
  });

  it("resetea el PIN desde el panel", async () => {
    const c = await loggedIn();
    const r = await c.form(`/api/admin/users/${memberId("lucia")}/pin`, { pin: "2468" });
    expect(r.status).toBe(200);
    expect(r.body).toContain("PIN de");
    expect((await verifyMemberPin(ref.t.db, memberId("lucia"), "2468")).ok).toBe(true);
  });

  it("muestra la contraseña temporal una sola vez", async () => {
    await ownerWithSession();
    const c = await loggedIn();
    const r = await c.form(`/api/admin/users/${memberId("carlos")}/password`, {});
    expect(r.status).toBe(200);
    expect(r.body).toMatch(/<code>[A-Za-z0-9]{12}<\/code>/);
  });

  it("baja una copia y rechaza nombres raros", async () => {
    const c = await loggedIn();
    const ok = await c.get("/api/admin/backups/mostrador-2026-10-05.dump");
    expect(ok.status).toBe(200);
    expect(ok.body).toBe("copia-nueva!");
    expect((await c.get("/api/admin/backups/..%2F..%2Fetc%2Fpasswd")).status).toBe(400);
    expect((await c.get("/api/admin/backups/mostrador-2099-01-01.dump")).status).toBe(404);
  });

  it("salir borra la sesión", async () => {
    const c = await loggedIn();
    const r = await c.form("/api/admin/logout", {});
    expect(r.status).toBe(302);
    expect((await c.get("/api/admin")).status).toBe(302);
  });
});
