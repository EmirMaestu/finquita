# Panel de admin (soporte) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un panel en `/api/admin`, con contraseña de servidor, para ver el estado del sistema, resetear contraseñas y PIN, y bajar las copias de la base.

**Architecture:** Rutas de Hono dentro de la API que devuelven HTML hecho con `hono/html` (sin React, fuera de la PWA). La sesión es una cookie firmada con HMAC, sin tabla nueva. La lógica está en `apps/api/src/admin/` (sesión, estado, usuarios, vistas) y las rutas en `apps/api/src/routes/admin.ts`, montadas en `app.ts` antes de `resolveActor`.

**Tech Stack:** Bun, Hono 4.13, Drizzle (Postgres 16), Better Auth 1.7 (`better-auth/crypto`), argon2 (`hashPin`), pg-boss 12 (tabla `pgboss.job`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-panel-admin-design.md`

**Convenciones del repo:** textos en español rioplatense con voseo; fechas `dd/mm/aaaa` y hora de 24 h (`formatDate` y `formatTime` de `@mostrador/shared`); commits en español; `bun run check` tiene que salir en 0 al terminar cada tarea. Los tests de la API usan una base propia por archivo (`useSeededDb()` carga el escenario "Almacén La Esquina").

---

## Mapa de archivos

| Archivo | Qué hace |
| --- | --- |
| `apps/api/src/admin/session.ts` (nuevo) | Config del panel, firmar y verificar la cookie, comparar la contraseña, bloqueo por IP |
| `apps/api/src/admin/session.test.ts` (nuevo) | Tests unitarios de lo anterior |
| `apps/api/src/admin/status.ts` (nuevo) | Estado del sistema y lista de copias |
| `apps/api/src/admin/users.ts` (nuevo) | Lista del equipo, reset de contraseña y de PIN, con auditoría |
| `apps/api/src/admin/views.ts` (nuevo) | HTML del login, del panel y de la página de error |
| `apps/api/src/routes/admin.ts` (nuevo) | Rutas `/api/admin/*` |
| `apps/api/src/app.ts` (modificar) | `AppDeps.admin` y montar las rutas |
| `apps/api/test/admin.test.ts` (nuevo) | Tests de integración |
| `.env.example`, `docs/DEPLOY.md` (modificar) | `ADMIN_PASSWORD`, `APP_VERSION`, `BACKUPS_DIR` |
| `infra/vps/*` (nuevo) | Compose, bloque de Caddy, copia diaria y `deploy.sh` del VPS compartido |

---

### Task 1: Sesión del panel

**Files:**
- Create: `apps/api/src/admin/session.ts`
- Test: `apps/api/src/admin/session.test.ts`

- [ ] **Step 1: Escribir los tests**

```ts
// apps/api/src/admin/session.test.ts
import { describe, expect, it } from "vitest";
import {
  type AdminConfig,
  checkPassword,
  LoginLimiter,
  SESSION_MS,
  signSession,
  verifySession,
} from "./session";

const cfg: AdminConfig = {
  password: "una-contraseña-de-admin-larga",
  secret: "secreto-de-test-con-largo-suficiente-1234",
  origin: "http://localhost:5173",
  backupsDir: "/no-existe",
  version: "test",
  secure: false,
  startedAt: new Date(0),
};

describe("cookie de sesión", () => {
  it("verifica una cookie recién firmada", () => {
    expect(verifySession(cfg, signSession(cfg))).toBe(true);
  });

  it("rechaza una cookie vencida", () => {
    const now = Date.now();
    const v = signSession(cfg, now);
    expect(verifySession(cfg, v, now + SESSION_MS + 1)).toBe(false);
  });

  it("rechaza una cookie adulterada", () => {
    const [exp, sig] = signSession(cfg).split(".");
    expect(verifySession(cfg, `${Number(exp) + 1000}.${sig}`)).toBe(false);
    expect(verifySession(cfg, "basura")).toBe(false);
    expect(verifySession(cfg, undefined)).toBe(false);
  });

  it("cambiar la contraseña invalida las sesiones abiertas", () => {
    const v = signSession(cfg);
    expect(verifySession({ ...cfg, password: "otra-contraseña-de-admin-larga" }, v)).toBe(false);
  });

  it("con el panel apagado no hay sesión válida", () => {
    expect(verifySession({ ...cfg, password: null }, signSession(cfg))).toBe(false);
  });
});

describe("contraseña", () => {
  it("compara la contraseña", () => {
    expect(checkPassword(cfg, "una-contraseña-de-admin-larga")).toBe(true);
    expect(checkPassword(cfg, "una-contraseña-de-admin-larg")).toBe(false);
    expect(checkPassword({ ...cfg, password: null }, "")).toBe(false);
  });
});

describe("bloqueo por intentos", () => {
  it("cinco fallos bloquean 15 minutos y después se puede volver a probar", () => {
    const l = new LoginLimiter();
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) l.fail("1.2.3.4", t);
    expect(l.blocked("1.2.3.4", t)).toBe(false);
    l.fail("1.2.3.4", t);
    expect(l.blocked("1.2.3.4", t)).toBe(true);
    expect(l.blocked("5.6.7.8", t)).toBe(false);
    expect(l.blocked("1.2.3.4", t + 15 * 60_000 + 1)).toBe(false);
  });

  it("un ingreso bueno limpia los fallos", () => {
    const l = new LoginLimiter();
    for (let i = 0; i < 4; i++) l.fail("ip", 0);
    l.success("ip");
    l.fail("ip", 0);
    expect(l.blocked("ip", 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `bunx vitest run apps/api/src/admin/session.test.ts`
Expected: FAIL, no encuentra `./session`.

- [ ] **Step 3: Implementar**

```ts
// apps/api/src/admin/session.ts
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Panel de soporte: una contraseña de servidor, sin usuario en la app. */
export type AdminConfig = {
  /** null = panel apagado (falta ADMIN_PASSWORD o es corta). */
  password: string | null;
  secret: string;
  /** Origen del sitio, para rechazar formularios enviados desde otro lado. */
  origin: string;
  backupsDir: string;
  version: string;
  secure: boolean;
  startedAt: Date;
};

export const ADMIN_COOKIE = "mostrador_admin";
export const SESSION_MS = 8 * 60 * 60_000;
export const MIN_ADMIN_PASSWORD = 16;

export function adminConfigFromEnv(): Omit<AdminConfig, "secret" | "origin"> {
  const pw = process.env.ADMIN_PASSWORD ?? "";
  return {
    password: pw.length >= MIN_ADMIN_PASSWORD ? pw : null,
    backupsDir: process.env.BACKUPS_DIR ?? "/backups",
    version: process.env.APP_VERSION ?? "dev",
    secure: process.env.NODE_ENV === "production",
    startedAt: new Date(),
  };
}

/** Compara en tiempo constante (los hash igualan el largo). */
function safeEqual(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

/** La clave depende de la contraseña: si cambia, las sesiones viejas dejan de valer. */
function key(cfg: AdminConfig): Buffer {
  return createHmac("sha256", cfg.secret).update(`admin:${cfg.password ?? ""}`).digest();
}

function sign(cfg: AdminConfig, exp: string): string {
  return createHmac("sha256", key(cfg)).update(exp).digest("base64url");
}

export function signSession(cfg: AdminConfig, now = Date.now()): string {
  const exp = String(now + SESSION_MS);
  return `${exp}.${sign(cfg, exp)}`;
}

export function verifySession(cfg: AdminConfig, value: string | undefined, now = Date.now()) {
  if (!cfg.password || !value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) <= now) return false;
  return safeEqual(sig, sign(cfg, exp));
}

export function checkPassword(cfg: AdminConfig, input: string): boolean {
  return cfg.password !== null && safeEqual(input, cfg.password);
}

/** Cinco intentos fallidos desde una IP la bloquean 15 minutos (en memoria: una sola API). */
export class LoginLimiter {
  private fails = new Map<string, { count: number; until: number }>();

  constructor(
    private max = 5,
    private lockMs = 15 * 60_000,
  ) {}

  blocked(ip: string, now = Date.now()): boolean {
    const f = this.fails.get(ip);
    return !!f && f.until > now;
  }

  fail(ip: string, now = Date.now()): void {
    const prev = this.fails.get(ip);
    const expired = prev && prev.count >= this.max && prev.until <= now;
    const count = expired ? 1 : (prev?.count ?? 0) + 1;
    this.fails.set(ip, { count, until: count >= this.max ? now + this.lockMs : 0 });
  }

  success(ip: string): void {
    this.fails.delete(ip);
  }
}
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `bunx vitest run apps/api/src/admin/session.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Formato y commit**

```bash
bunx biome check --write apps/api/src/admin
git add apps/api/src/admin
git commit -m "Admin: sesión del panel con cookie firmada y bloqueo por intentos"
```

---

### Task 2: Estado del sistema y copias

**Files:**
- Create: `apps/api/src/admin/status.ts`
- Test: `apps/api/test/admin.test.ts` (se crea acá y crece en las tareas siguientes)

- [ ] **Step 1: Escribir los tests**

```ts
// apps/api/test/admin.test.ts
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdminConfig } from "../src/admin/session";
import { listBackups, systemStatus } from "../src/admin/status";
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
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `bunx vitest run apps/api/test/admin.test.ts`
Expected: FAIL, no encuentra `../src/admin/status`.

- [ ] **Step 3: Implementar**

```ts
// apps/api/src/admin/status.ts
import { readdir, stat, statfs } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import type { AdminConfig } from "./session";

export const BACKUP_RE = /^mostrador-\d{4}-\d{2}-\d{2}\.dump$/;
export const WORKER_STALE_MS = 30 * 60_000;
export const BACKUP_STALE_MS = 36 * 60 * 60_000;

export type Backup = { name: string; size: number; modifiedAt: Date };

export type SystemStatus = {
  version: string;
  startedAt: Date;
  db: { ok: boolean; ms: number | null; sizeBytes: number | null };
  worker: { lastRun: Date | null; stale: boolean };
  disk: { freeBytes: number; totalBytes: number } | null;
  lastBackup: Backup | null;
  backupStale: boolean;
};

/** Copias diarias (las deja backup.sh en el VPS), de la más nueva a la más vieja. */
export async function listBackups(dir: string): Promise<Backup[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: Backup[] = [];
  for (const name of names.filter((n) => BACKUP_RE.test(n))) {
    const s = await stat(join(dir, name));
    out.push({ name, size: s.size, modifiedAt: s.mtime });
  }
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

export async function systemStatus(
  db: Db,
  cfg: AdminConfig,
  now = new Date(),
): Promise<SystemStatus> {
  const dbStatus: SystemStatus["db"] = { ok: false, ms: null, sizeBytes: null };
  let lastRun: Date | null = null;
  try {
    const t = performance.now();
    await db.execute(sql`select 1`);
    dbStatus.ms = Math.round(performance.now() - t);
    dbStatus.ok = true;
    const [size] = await db.execute<{ size: string }>(
      sql`select pg_database_size(current_database())::text as size`,
    );
    dbStatus.sizeBytes = Number(size?.size ?? 0);
  } catch {}
  if (dbStatus.ok) {
    try {
      // pg-boss guarda las tareas en su propio esquema; en los tests no existe.
      const [row] = await db.execute<{ epoch: number | null }>(
        sql`select extract(epoch from max(completed_on))::float8 as epoch
            from pgboss.job where name = 'checks' and state = 'completed'`,
      );
      lastRun = row?.epoch ? new Date(row.epoch * 1000) : null;
    } catch {}
  }

  let disk: SystemStatus["disk"] = null;
  try {
    const s = await statfs(cfg.backupsDir);
    disk = { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch {}

  const [lastBackup = null] = await listBackups(cfg.backupsDir);
  return {
    version: cfg.version,
    startedAt: cfg.startedAt,
    db: dbStatus,
    worker: {
      lastRun,
      stale: !lastRun || now.getTime() - lastRun.getTime() > WORKER_STALE_MS,
    },
    disk,
    lastBackup,
    backupStale:
      !lastBackup || now.getTime() - lastBackup.modifiedAt.getTime() > BACKUP_STALE_MS,
  };
}
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `bunx vitest run apps/api/test/admin.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Formato y commit**

```bash
bunx biome check --write apps/api/src/admin apps/api/test/admin.test.ts
git add apps/api/src/admin/status.ts apps/api/test/admin.test.ts
git commit -m "Admin: estado del sistema y lista de copias"
```

---

### Task 3: Usuarios: lista y resets

**Files:**
- Create: `apps/api/src/admin/users.ts`
- Modify: `apps/api/test/admin.test.ts` (agregar al final)

- [ ] **Step 1: Escribir los tests** (sumar estos imports arriba y los bloques al final del archivo)

```ts
// imports nuevos en apps/api/test/admin.test.ts
import { verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { verifyMemberPin } from "../src/auth/pin";
import { AdminError, listUsers, resetPassword, resetPin } from "../src/admin/users";
import { auditLog, authAccount, authSession, members, pinSessions } from "../src/db/schema/index";
import { TEST_AUTH, TestClient } from "./helpers/client";
import { createApp } from "../src/app";
import { memberId } from "./helpers/actors";
```

```ts
// bloques nuevos al final de apps/api/test/admin.test.ts
/** El dueño crea su cuenta (el seed no trae contraseñas) y queda con una sesión abierta. */
async function ownerWithSession() {
  const c = new TestClient(createApp({ db: ref.t.db, auth: TEST_AUTH }));
  const r = await c.signUp("carlos@laesquina.example", "contraseña-larga", "Carlos Díaz");
  expect(r.status).toBe(200);
  const [m] = await ref.t.db.select().from(members).where(eq(members.id, memberId("carlos")));
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
    expect((await ref.t.db.select().from(authSession).where(eq(authSession.userId, userId))).length)
      .toBeGreaterThan(0);

    const temp = await resetPassword(ref.t.db, memberId("carlos"));
    expect(temp).toMatch(/^[A-Za-z0-9]{12}$/);

    const [acc] = await ref.t.db
      .select()
      .from(authAccount)
      .where(and(eq(authAccount.userId, userId), eq(authAccount.providerId, "credential")));
    expect(await verifyPassword({ hash: acc?.password ?? "", password: temp })).toBe(true);
    expect(
      await verifyPassword({ hash: acc?.password ?? "", password: "contraseña-larga" }),
    ).toBe(false);
    expect(await ref.t.db.select().from(authSession).where(eq(authSession.userId, userId)))
      .toEqual([]);

    const [a] = await ref.t.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "admin.reset_password"));
    expect(a).toMatchObject({ entityId: memberId("carlos"), note: "Soporte (panel de admin)" });
    expect(JSON.stringify(a)).not.toContain(temp);
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
    const [a] = await ref.t.db.select().from(auditLog).where(eq(auditLog.action, "admin.reset_pin"));
    expect(a).toMatchObject({ entityId: id });
    expect(JSON.stringify(a)).not.toContain("9876");
  });

  it("rechaza un PIN que no tiene de 4 a 6 números", async () => {
    await expect(resetPin(ref.t.db, memberId("lucia"), "12a4")).rejects.toBeInstanceOf(AdminError);
    await expect(resetPin(ref.t.db, memberId("lucia"), "123")).rejects.toBeInstanceOf(AdminError);
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `bunx vitest run apps/api/test/admin.test.ts`
Expected: FAIL, no encuentra `../src/admin/users`.

- [ ] **Step 3: Implementar**

```ts
// apps/api/src/admin/users.ts
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq, max } from "drizzle-orm";
import { hashPin, PIN_RE } from "../auth/pin";
import type { Db } from "../db/client";
import { authAccount, authSession, members, pinSessions, type Role } from "../db/schema/index";
import { audit } from "../lib/audit";

export const ADMIN_NOTE = "Soporte (panel de admin)";

/** Error que se le muestra tal cual a quien usa el panel. */
export class AdminError extends Error {}

export type AdminUser = {
  id: string;
  name: string;
  role: Role;
  email: string | null;
  active: boolean;
  hasAccount: boolean;
  hasPin: boolean;
  lastLogin: Date | null;
};

const ROLE_ORDER: Record<Role, number> = { owner: 0, manager: 1, cashier: 2, stocker: 3 };
// Sin caracteres que se confunden al dictarlos (0/O, 1/l/I).
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function tempPassword(length = 12): string {
  return Array.from(randomBytes(length), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function listUsers(db: Db): Promise<AdminUser[]> {
  const rows = await db.select().from(members);
  const byPassword = await db
    .select({ userId: authSession.userId, at: max(authSession.createdAt) })
    .from(authSession)
    .groupBy(authSession.userId);
  const byPin = await db
    .select({ memberId: pinSessions.memberId, at: max(pinSessions.createdAt) })
    .from(pinSessions)
    .groupBy(pinSessions.memberId);
  const pw = new Map(byPassword.map((r) => [r.userId, r.at]));
  const pin = new Map(byPin.map((r) => [r.memberId, r.at]));

  return rows
    .map((m) => {
      const dates = [m.authUserId ? pw.get(m.authUserId) : null, pin.get(m.id)].filter(
        (d): d is Date => d instanceof Date,
      );
      return {
        id: m.id,
        name: m.name,
        role: m.role,
        email: m.email,
        active: m.active,
        hasAccount: m.authUserId !== null,
        hasPin: m.pinHash !== null,
        lastLogin: dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null,
      };
    })
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));
}

async function findMember(db: Db, memberId: string) {
  const [m] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
  if (!m) throw new AdminError("Esa persona no existe.");
  return m;
}

/** Pone una contraseña temporal, cierra todas sus sesiones y la devuelve (se muestra una vez). */
export async function resetPassword(db: Db, memberId: string, now = new Date()): Promise<string> {
  const m = await findMember(db, memberId);
  const userId = m.authUserId;
  if (!userId) throw new AdminError(`${m.name} no tiene cuenta con contraseña.`);
  const password = tempPassword();
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(authAccount)
      .set({ password: hash, updatedAt: now })
      .where(and(eq(authAccount.userId, userId), eq(authAccount.providerId, "credential")))
      .returning({ id: authAccount.id });
    if (!updated.length) throw new AdminError(`${m.name} no tiene cuenta con contraseña.`);
    await tx.delete(authSession).where(eq(authSession.userId, userId));
    await audit(tx, {
      action: "admin.reset_password",
      entityType: "member",
      entityId: m.id,
      note: ADMIN_NOTE,
      at: now,
    });
  });
  return password;
}

/** Pone un PIN nuevo, destraba el bloqueo por intentos y cierra sus sesiones de PIN. */
export async function resetPin(db: Db, memberId: string, pin: string, now = new Date()) {
  if (!PIN_RE.test(pin)) throw new AdminError("El PIN tiene que tener de 4 a 6 números.");
  const m = await findMember(db, memberId);
  const pinHash = await hashPin(pin);
  await db.transaction(async (tx) => {
    await tx
      .update(members)
      .set({ pinHash, pinFailedAttempts: 0, pinLockedUntil: null, updatedAt: now })
      .where(eq(members.id, m.id));
    await tx.delete(pinSessions).where(eq(pinSessions.memberId, m.id));
    await audit(tx, {
      action: "admin.reset_pin",
      entityType: "member",
      entityId: m.id,
      note: ADMIN_NOTE,
      at: now,
    });
  });
}
```

Si `Role` no se exporta desde `../db/schema/index`, importarlo de `../db/schema/business`.

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `bunx vitest run apps/api/test/admin.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Formato y commit**

```bash
bunx biome check --write apps/api/src/admin apps/api/test/admin.test.ts
git add apps/api/src/admin/users.ts apps/api/test/admin.test.ts
git commit -m "Admin: lista del equipo y reset de contraseña y PIN con auditoría"
```

---

### Task 4: Vistas HTML

**Files:**
- Create: `apps/api/src/admin/views.ts`

Sin test propio: las vistas se prueban en la Task 5 a través de las rutas.

- [ ] **Step 1: Implementar**

```ts
// apps/api/src/admin/views.ts
import { formatDate, formatTime } from "@mostrador/shared";
import { html } from "hono/html";
import type { Role } from "../db/schema/index";
import type { Backup, SystemStatus } from "./status";
import type { AdminUser } from "./users";

export type Flash = { kind: "ok" | "error"; text: string; secret?: string };

const ROLE_LABEL: Record<Role, string> = {
  owner: "Dueño",
  manager: "Encargado",
  cashier: "Cajero",
  stocker: "Repositor",
};

const when = (d: Date | null) => (d ? `${formatDate(d)} ${formatTime(d)}` : "—");

export function bytes(n: number | null): string {
  if (n === null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString("es-AR", { maximumFractionDigits: 1 })} ${units[i]}`;
}

const CSS = `
:root{--fondo:#faf8f5;--superficie:#fff;--borde:#e7e2da;--texto:#1f1b16;--suave:#6b635a;
--primario:#1f6b4f;--exito:#177a48;--exito-s:#e3f2e9;--peligro:#c2362f;--peligro-s:#fbe5e3}
@media (prefers-color-scheme:dark){:root{--fondo:#14120f;--superficie:#1d1a16;--borde:#34302a;
--texto:#f2eee8;--suave:#b3aaa0;--exito-s:#17301f;--peligro-s:#3a1c1a}}
*{box-sizing:border-box}body{margin:0;background:var(--fondo);color:var(--texto);
font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:960px;margin:0 auto;padding:16px}
header{display:flex;justify-content:space-between;align-items:center;gap:8px}
h1{font-size:20px;margin:8px 0}h2{font-size:17px;margin:24px 0 8px}
section{background:var(--superficie);border:1px solid var(--borde);border-radius:12px;padding:16px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 6px;
border-bottom:1px solid var(--borde);vertical-align:middle}th{color:var(--suave);font-weight:500}
.scroll{overflow-x:auto}.ok{color:var(--exito)}.mal{color:var(--peligro)}.suave{color:var(--suave)}
.flash{padding:12px;border-radius:8px;margin:12px 0}.flash.ok{background:var(--exito-s)}
.flash.error{background:var(--peligro-s)}code{font-size:18px;font-weight:600;letter-spacing:1px}
form{display:inline-flex;gap:6px;margin:2px 0}input{font:inherit;padding:6px 8px;
border:1px solid var(--borde);border-radius:8px;background:var(--superficie);color:var(--texto)}
input[name=pin]{width:90px}button{font:inherit;padding:6px 12px;border-radius:8px;
border:1px solid var(--primario);background:var(--primario);color:#fff;cursor:pointer}
button.sec{background:transparent;color:var(--primario)}
.login{max-width:360px;margin:15vh auto}.login form{display:flex;flex-direction:column;width:100%}
`;

function layout(title: string, body: ReturnType<typeof html>) {
  return html`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${title}</title>
    <style>${CSS}</style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
}

export function loginPage(error?: string) {
  return layout(
    "Panel de soporte",
    html`<div class="login">
      <h1>Panel de soporte</h1>
      ${error ? html`<p class="flash error">${error}</p>` : ""}
      <form method="post" action="/api/admin/login">
        <input type="password" name="password" placeholder="Contraseña" autofocus required />
        <button type="submit">Entrar</button>
      </form>
    </div>`,
  );
}

export function errorPage(requestId: string) {
  return layout(
    "Algo falló",
    html`<h1>Algo falló</h1>
      <p>Buscá este código en los logs de la API: <code>${requestId}</code></p>
      <p><a href="/api/admin">Volver al panel</a></p>`,
  );
}

function statusRows(s: SystemStatus | null) {
  if (!s) return html`<p class="mal">No disponible</p>`;
  const row = (label: string, value: unknown, ok?: boolean) =>
    html`<tr>
      <th>${label}</th>
      <td class="${ok === undefined ? "" : ok ? "ok" : "mal"}">${value}</td>
    </tr>`;
  return html`<table>
    ${row("Versión", `${s.version} · prendida desde ${when(s.startedAt)}`)}
    ${row(
      "Base",
      s.db.ok ? `Responde en ${s.db.ms} ms · ${bytes(s.db.sizeBytes)}` : "No responde",
      s.db.ok,
    )}
    ${row(
      "Worker",
      s.worker.lastRun ? `Última corrida: ${when(s.worker.lastRun)}` : "Sin corridas registradas",
      !s.worker.stale,
    )}
    ${row(
      "Disco",
      s.disk ? `${bytes(s.disk.freeBytes)} libres de ${bytes(s.disk.totalBytes)}` : "No disponible",
    )}
    ${row(
      "Última copia",
      s.lastBackup
        ? `${when(s.lastBackup.modifiedAt)} · ${bytes(s.lastBackup.size)}`
        : "Todavía no hay copias",
      !s.backupStale,
    )}
  </table>`;
}

function usersTable(users: AdminUser[] | null) {
  if (!users) return html`<p class="mal">No disponible</p>`;
  return html`<div class="scroll">
    <table>
      <tr>
        <th>Nombre</th>
        <th>Rol</th>
        <th>Email</th>
        <th>Último ingreso</th>
        <th>Acciones</th>
      </tr>
      ${users.map(
        (u) => html`<tr>
          <td>${u.name}${u.active ? "" : html` <span class="suave">(inactivo)</span>`}</td>
          <td>${ROLE_LABEL[u.role]}</td>
          <td>${u.email ?? "—"}</td>
          <td>${when(u.lastLogin)}</td>
          <td>
            ${
              u.hasAccount
                ? html`<form method="post" action="/api/admin/users/${u.id}/password">
                    <button class="sec" type="submit">Resetear contraseña</button>
                  </form>`
                : ""
            }
            ${
              u.hasPin
                ? html`<form method="post" action="/api/admin/users/${u.id}/pin">
                    <input name="pin" inputmode="numeric" pattern="[0-9]{4,6}"
                      placeholder="PIN nuevo" required />
                    <button class="sec" type="submit">Resetear PIN</button>
                  </form>`
                : ""
            }
          </td>
        </tr>`,
      )}
    </table>
  </div>`;
}

function backupsTable(backups: Backup[]) {
  if (!backups.length) return html`<p class="suave">Todavía no hay copias.</p>`;
  return html`<table>
    ${backups.map(
      (b) => html`<tr>
        <td>${when(b.modifiedAt)}</td>
        <td>${bytes(b.size)}</td>
        <td><a href="/api/admin/backups/${b.name}">Descargar</a></td>
      </tr>`,
    )}
  </table>`;
}

export function panelPage(p: {
  status: SystemStatus | null;
  users: AdminUser[] | null;
  backups: Backup[];
  flash?: Flash;
}) {
  return layout(
    "Panel de soporte",
    html`<header>
        <h1>Panel de soporte</h1>
        <form method="post" action="/api/admin/logout">
          <button class="sec" type="submit">Salir</button>
        </form>
      </header>
      ${
        p.flash
          ? html`<div class="flash ${p.flash.kind}">
              ${p.flash.text}
              ${p.flash.secret ? html`<br /><code>${p.flash.secret}</code>` : ""}
            </div>`
          : ""
      }
      <h2>Estado del sistema</h2>
      <section>${statusRows(p.status)}</section>
      <h2>Usuarios</h2>
      <section>${usersTable(p.users)}</section>
      <h2>Copias</h2>
      <section>${backupsTable(p.backups)}</section>`,
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: sin errores. Si `formatDate` o `formatTime` no aceptan `Date`, usar `toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour12: false })` dentro de `when`.

- [ ] **Step 3: Formato y commit**

```bash
bunx biome check --write apps/api/src/admin
git add apps/api/src/admin/views.ts
git commit -m "Admin: vistas HTML del login y del panel"
```

---

### Task 5: Rutas y montaje en la app

**Files:**
- Create: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/admin.test.ts` (agregar al final)

- [ ] **Step 1: Escribir los tests de integración** (al final de `apps/api/test/admin.test.ts`)

```ts
const ADMIN_PW = "una-contraseña-de-admin-larga";

function adminApp(password: string | null = ADMIN_PW) {
  return createApp({
    db: ref.t.db,
    auth: TEST_AUTH,
    admin: { password, backupsDir: dir, version: "abc1234" },
  });
}
```

`TestClient.request` no sabe mandar formularios: agregar a `apps/api/test/helpers/client.ts` este método:

```ts
// apps/api/test/helpers/client.ts, dentro de la clase TestClient
  async form(path: string, fields: Record<string, string>, origin = ORIGIN) {
    const h: Record<string, string> = {
      origin,
      "content-type": "application/x-www-form-urlencoded",
    };
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await this.app.request(`http://localhost${path}`, {
      method: "POST",
      headers: h,
      body: new URLSearchParams(fields).toString(),
      redirect: "manual",
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, ...v] = (pair ?? "").split("=");
      if (k) this.cookies.set(k.trim(), v.join("="));
    }
    return { status: res.status, location: res.headers.get("location"), body: await res.text() };
  }
```

Los tests usan `c.form(...)`:

```ts
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
```

Nota: `app.request` de Hono no sigue redirecciones, así que `c.get` devuelve el 302 tal cual.

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `bunx vitest run apps/api/test/admin.test.ts`
Expected: FAIL, `createApp` no acepta `admin` y `c.form` no existe (hasta agregarlo al helper en este mismo paso: agregalo antes de correr).

- [ ] **Step 3: Implementar las rutas**

```ts
// apps/api/src/routes/admin.ts
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../app";
import {
  ADMIN_COOKIE,
  type AdminConfig,
  checkPassword,
  LoginLimiter,
  SESSION_MS,
  signSession,
  verifySession,
} from "../admin/session";
import { BACKUP_RE, listBackups, systemStatus } from "../admin/status";
import { AdminError, listUsers, resetPassword, resetPin } from "../admin/users";
import { errorPage, type Flash, loginPage, panelPage } from "../admin/views";
import { log } from "../lib/log";

const clientIp = (h: string | undefined) => h?.split(",")[0]?.trim() || "local";

export function adminRoutes(cfg: AdminConfig) {
  const r = new Hono<AppEnv>();
  const limiter = new LoginLimiter();

  // Sin contraseña configurada, el panel no existe.
  r.use("*", async (c, next) => {
    if (!cfg.password) return c.notFound();
    c.header("Cache-Control", "no-store");
    c.header("X-Frame-Options", "DENY");
    await next();
  });

  // Los formularios solo valen desde el mismo sitio.
  r.use("*", async (c, next) => {
    if (c.req.method === "POST" && c.req.header("origin") !== cfg.origin) {
      return c.text("Origen no permitido", 403);
    }
    await next();
  });

  r.onError((err, c) => {
    log.error("panel de admin", {
      requestId: c.get("requestId"),
      error: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
    });
    return c.html(errorPage(c.get("requestId")), 500);
  });

  r.get("/login", (c) => c.html(loginPage()));

  r.post("/login", async (c) => {
    const ip = clientIp(c.req.header("x-forwarded-for"));
    if (limiter.blocked(ip)) {
      return c.html(loginPage("Demasiados intentos. Probá de nuevo en 15 minutos."), 429);
    }
    const body = await c.req.parseBody();
    const password = typeof body.password === "string" ? body.password : "";
    if (!checkPassword(cfg, password)) {
      limiter.fail(ip);
      log.warn("panel de admin: contraseña incorrecta", { ip });
      return c.html(loginPage("Contraseña incorrecta."), 401);
    }
    limiter.success(ip);
    setCookie(c, ADMIN_COOKIE, signSession(cfg), {
      path: "/api/admin",
      httpOnly: true,
      secure: cfg.secure,
      sameSite: "Strict",
      maxAge: SESSION_MS / 1000,
    });
    log.info("panel de admin: ingreso", { ip });
    return c.redirect("/api/admin", 302);
  });

  // De acá para abajo, hace falta sesión.
  r.use("*", async (c, next) => {
    if (!verifySession(cfg, getCookie(c, ADMIN_COOKIE))) {
      return c.redirect("/api/admin/login", 302);
    }
    await next();
  });

  r.post("/logout", (c) => {
    deleteCookie(c, ADMIN_COOKIE, { path: "/api/admin" });
    return c.redirect("/api/admin/login", 302);
  });

  const render = async (db: AppEnv["Variables"]["db"], flash?: Flash) => {
    const status = await systemStatus(db, cfg);
    const users = status.db.ok ? await listUsers(db).catch(() => null) : null;
    const backups = await listBackups(cfg.backupsDir);
    return panelPage({ status, users, backups, flash });
  };

  r.get("/", async (c) => c.html(await render(c.get("db"))));

  r.post("/users/:id/password", async (c) => {
    const db = c.get("db");
    try {
      const temp = await resetPassword(db, c.req.param("id"));
      return c.html(
        await render(db, {
          kind: "ok",
          text: "Contraseña temporal (se muestra solo esta vez; pedile que la cambie):",
          secret: temp,
        }),
      );
    } catch (err) {
      if (!(err instanceof AdminError)) throw err;
      return c.html(await render(db, { kind: "error", text: err.message }), 400);
    }
  });

  r.post("/users/:id/pin", async (c) => {
    const db = c.get("db");
    const body = await c.req.parseBody();
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";
    try {
      await resetPin(db, c.req.param("id"), pin);
      return c.html(await render(db, { kind: "ok", text: "PIN de la persona actualizado." }));
    } catch (err) {
      if (!(err instanceof AdminError)) throw err;
      return c.html(await render(db, { kind: "error", text: err.message }), 400);
    }
  });

  r.get("/backups/:name", async (c) => {
    const name = c.req.param("name");
    if (!BACKUP_RE.test(name)) return c.text("Nombre de copia inválido", 400);
    const path = join(cfg.backupsDir, name);
    const s = await stat(path).catch(() => null);
    if (!s?.isFile()) return c.text("Esa copia no existe", 404);
    const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(s.size),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  });

  return r;
}
```

Nota: el texto "PIN de la persona actualizado." contiene "PIN de", que es lo que busca el test.

- [ ] **Step 4: Montar en `app.ts`**

En `apps/api/src/app.ts`:

1. Imports nuevos:

```ts
import { type AdminConfig, adminConfigFromEnv } from "./admin/session";
import { adminRoutes } from "./routes/admin";
```

2. `AppDeps` queda:

```ts
export type AppDeps = {
  db: Db;
  auth?: AuthConfig;
  events?: EventHub;
  off?: Partial<OffConfig>;
  admin?: Partial<AdminConfig>;
};
```

3. Al principio de `createApp`, reemplazar `const auth = createAuth(deps.db, deps.auth ?? authConfigFromEnv());` por:

```ts
  const authConfig = deps.auth ?? authConfigFromEnv();
  const auth = createAuth(deps.db, authConfig);
  const admin: AdminConfig = {
    ...adminConfigFromEnv(),
    secret: authConfig.secret,
    origin: new URL(authConfig.baseURL).origin,
    ...deps.admin,
  };
```

4. Justo después de `app.on(["GET", "POST"], "/api/auth/*", ...)` y **antes** de `app.use("/api/*", resolveActor());`:

```ts
  // Panel de soporte: va antes de resolveActor (no usa dispositivos ni PIN).
  app.route("/api/admin", adminRoutes(admin));
```

- [ ] **Step 5: Correr los tests y ver que pasan**

Run: `bunx vitest run apps/api/test/admin.test.ts apps/api/src/admin`
Expected: PASS (todos).

- [ ] **Step 6: Correr todo `check`**

Run: `bun run check`
Expected: sale con código 0 (Biome, typecheck y Vitest de todo el monorepo).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/admin.ts apps/api/src/app.ts apps/api/test/admin.test.ts apps/api/test/helpers/client.ts
git commit -m "Admin: rutas del panel de soporte en /api/admin"
```

---

### Task 6: Configuración, documentación y archivos del VPS

**Files:**
- Modify: `.env.example`
- Modify: `docs/DEPLOY.md`
- Create: `infra/vps/compose.yml`, `infra/vps/mostrador.caddy`, `infra/vps/backup.sh`, `infra/vps/deploy.sh`

- [ ] **Step 1: `.env.example`** (agregar al final)

```sh
# Panel de soporte en /api/admin. Vacío o con menos de 16 caracteres = apagado.
ADMIN_PASSWORD=
# Commit que está corriendo (lo pone el deploy) y carpeta de las copias que lista el panel.
APP_VERSION=dev
BACKUPS_DIR=/backups
```

- [ ] **Step 2: `infra/vps/`** — copiar los archivos que hoy están en el VPS (`/opt/mostrador/compose.yml`, `/etc/caddy/mostrador.caddy`, `/opt/mostrador/backup.sh`) y en `compose.yml`, servicio `api`, sumar:

```yaml
    environment:
      <<: *app-env
      PORT: "3000"
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}
      APP_VERSION: ${APP_VERSION:-dev}
      BACKUPS_DIR: /backups
    volumes:
      - files:/data/files
      - /opt/mostrador/backups:/backups:ro
```

- [ ] **Step 3: `infra/vps/deploy.sh`**

```bash
#!/usr/bin/env bash
# Deploy de Mostrador al VPS compartido (finquita.emir-maestu.com), desde la PC.
#   bash infra/vps/deploy.sh
# Sube el código del commit actual, reconstruye la API y cambia la web de golpe.
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=emir@217.76.48.219
TAG="$(git rev-parse --short HEAD)"
[ -z "$(git status --porcelain)" ] || { echo "Hay cambios sin commitear"; exit 1; }

TMP="$(mktemp -d)"
git archive --format=tar.gz -o "$TMP/src.tar.gz" HEAD
(cd apps/web && bunx vite build)
tar --force-local -czf "$TMP/web.tar.gz" -C apps/web/dist .

ssh "$HOST" 'rm -rf /tmp/mostrador-up && mkdir -p /tmp/mostrador-up'
scp -q "$TMP/src.tar.gz" "$TMP/web.tar.gz" infra/vps/compose.yml infra/vps/backup.sh \
  "$HOST:/tmp/mostrador-up/"
ssh "$HOST" "TAG=$TAG bash -s" <<'EOF'
set -euo pipefail
cd /opt/mostrador
rm -rf src && mkdir src && tar -xzf /tmp/mostrador-up/src.tar.gz -C src
cp /tmp/mostrador-up/compose.yml /tmp/mostrador-up/backup.sh . && chmod +x backup.sh
sed -i '/^APP_VERSION=/d' .env && echo "APP_VERSION=$TAG" >> .env
docker compose up -d --build
for i in $(seq 1 30); do curl -sf -m 3 http://127.0.0.1:3100/api/health >/dev/null && break; sleep 2; done
curl -sf -m 3 http://127.0.0.1:3100/api/health
sudo rm -rf /var/www/mostrador.new && sudo mkdir -p /var/www/mostrador.new
sudo tar -xzf /tmp/mostrador-up/web.tar.gz -C /var/www/mostrador.new
sudo chmod -R a+rX /var/www/mostrador.new
sudo rm -rf /var/www/mostrador.old
[ -d /var/www/mostrador ] && sudo mv /var/www/mostrador /var/www/mostrador.old
sudo mv /var/www/mostrador.new /var/www/mostrador
rm -rf /tmp/mostrador-up
echo "Listo: https://finquita.emir-maestu.com (versión $TAG)"
EOF
rm -rf "$TMP"
```

- [ ] **Step 4: `docs/DEPLOY.md`** — sumar al final:

```markdown
## VPS compartido (finquita.emir-maestu.com)

Mostrador corre en el mismo VPS que otros sitios, detrás del Caddy del sistema (no el de este compose):

- `/opt/mostrador`: `compose.yml` (proyecto `mostrador-prod`: postgres, api en `127.0.0.1:3100`, worker), `.env` (600) y `backups/`.
- `/var/www/mostrador`: la web compilada. `/etc/caddy/mostrador.caddy`, importado desde el Caddyfile.
- Copia diaria a las 04:30 (`backup.sh` por cron, guarda 30).
- Deploy desde la PC: `bash infra/vps/deploy.sh` (commit limpio).

### Panel de soporte

`https://finquita.emir-maestu.com/api/admin`, con la contraseña `ADMIN_PASSWORD` del `.env` del VPS (16 caracteres o más; sin ella el panel no existe). Muestra el estado, permite resetear contraseñas y PIN (queda en la auditoría) y bajar las copias. Para cambiar la contraseña: editar `.env` y `docker compose up -d api`.
```

- [ ] **Step 5: Commit**

```bash
chmod +x infra/vps/deploy.sh infra/vps/backup.sh
git add .env.example docs/DEPLOY.md infra/vps
git commit -m "Admin: variables, documentación y deploy al VPS compartido"
```

---

### Task 7: Deploy

- [ ] **Step 1:** Generar `ADMIN_PASSWORD` en el VPS (no pasa por la PC) y dejarla en `.env`:

```bash
ssh emir@217.76.48.219 'cd /opt/mostrador && grep -q "^ADMIN_PASSWORD=" .env || echo "ADMIN_PASSWORD=$(openssl rand -base64 24)" >> .env'
```

- [ ] **Step 2:** `bash infra/vps/deploy.sh`. Expected: termina con "Listo: https://finquita.emir-maestu.com (versión …)".

- [ ] **Step 3:** Verificar:
  - `curl -s -o /dev/null -w "%{http_code}" https://finquita.emir-maestu.com/api/admin/login` da 200.
  - Asistente, momec.pro y Braconi siguen en 200.
  - Entrar al panel y ver Estado (worker en verde, última copia de hoy), Usuarios y Copias.

- [ ] **Step 4:** Pasarle la contraseña a Emir: `ssh emir@217.76.48.219 'grep ^ADMIN_PASSWORD /opt/mostrador/.env'` (la lee él en su terminal; no se pega en el chat).
