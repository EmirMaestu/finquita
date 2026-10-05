/**
 * Levanta la API para los e2e sobre una base propia, recién creada:
 * migraciones, escenario de ejemplo, cuenta del dueño y la Mac del mostrador habilitada.
 */
import postgres from "postgres";
import { E2E } from "../../../e2e/env";
import { createApp } from "../src/app";
import { hashPin } from "../src/auth/pin";
import { createDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { devices } from "../src/db/schema/index";
import { EventHub } from "../src/lib/events";
import { hashToken } from "../src/lib/tokens";
import { seedId } from "../src/seed/ids";
import { seed } from "../src/seed/seed";

const base = process.env.DATABASE_URL;
if (!base) throw new Error("Falta DATABASE_URL");
// Con E2E_EMPTY=1: una instalación nueva, sin escenario ni cuenta (primer uso).
const empty = process.env.E2E_EMPTY === "1";
const dbName = empty ? E2E.empty.db : E2E.db;
const url = new URL(base);
url.pathname = `/${dbName}`;
const admin = new URL(base);
admin.pathname = "/postgres";

const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
await sql.unsafe(`drop database if exists "${dbName}" with (force)`);
await sql.unsafe(`create database "${dbName}"`);
await sql.end();

await runMigrations(url.toString());
const { db, sql: conn } = createDb(url.toString());
if (!empty) {
  await seed(db, { hashPin, today: process.env.SEED_TODAY });
  await db.insert(devices).values({
    id: seedId("device:mac"),
    name: "Mac del mostrador",
    kind: "mac",
    registerId: seedId("register:1"),
    tokenHash: hashToken(E2E.macToken),
    enabledAt: new Date(),
  });
}

const events = new EventHub();
await events.listen(conn);
const app = createApp({
  db,
  events,
  auth: {
    secret: "secreto-e2e-con-largo-suficiente-123456",
    baseURL: empty ? E2E.empty.webUrl : E2E.webUrl,
  },
});
if (!empty) {
  const res = await app.request(`${E2E.webUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: E2E.webUrl },
    body: JSON.stringify({
      email: E2E.owner.email,
      password: E2E.owner.password,
      name: "Carlos Díaz",
    }),
  });
  if (!res.ok)
    throw new Error(`No se pudo crear la cuenta del dueño: ${res.status} ${await res.text()}`);
}

Bun.serve({ port: empty ? E2E.empty.apiPort : E2E.apiPort, fetch: app.fetch, idleTimeout: 0 });
console.log(`api e2e en ${empty ? E2E.empty.apiPort : E2E.apiPort}`);
