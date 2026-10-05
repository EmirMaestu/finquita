import type { Hono } from "hono";
import type { Db } from "../../src/db/client";
import { devices } from "../../src/db/schema/index";
import { hashToken } from "../../src/lib/tokens";
import { seedId } from "../../src/seed/ids";
import { TEAM } from "../../src/seed/scenario";
import { TestClient } from "./client";

export const MAC_TOKEN = "token-de-la-mac-del-mostrador";
export type MemberKey = "carlos" | "julian" | "lucia" | "tomas" | "nico";

export const memberId = (key: MemberKey) => seedId(`member:${key}`);
export const pinOf = (key: MemberKey) => TEAM.find((m) => m.key === key)?.pin ?? "";

/** Habilita la Mac del mostrador directo en la base (sin pasar por la cuenta del dueño). */
export async function ensureMac(db: Db): Promise<string> {
  const id = seedId("device:mac");
  await db
    .insert(devices)
    .values({
      id,
      name: "Mac del mostrador",
      kind: "mac",
      registerId: seedId("register:1"),
      tokenHash: hashToken(MAC_TOKEN),
      enabledAt: new Date(),
    })
    .onConflictDoNothing();
  return id;
}

/** Cliente con la sesión de PIN de una persona del equipo en la Mac. */
// biome-ignore lint/suspicious/noExplicitAny: cualquier app de Hono
export async function as(app: Hono<any>, db: Db, key: MemberKey): Promise<TestClient> {
  await ensureMac(db);
  const c = new TestClient(app);
  c.deviceToken = MAC_TOKEN;
  const r = await c.post("/api/pin/login", { memberId: memberId(key), pin: pinOf(key) });
  if (r.status !== 200) throw new Error(`No pudo entrar ${key}: ${JSON.stringify(r.body)}`);
  c.pinToken = r.body.token;
  return c;
}

/** Cabecera para autorizar con el PIN de alguien. */
export const authorizeWith = (key: MemberKey) => ({
  "x-authorize": `${memberId(key)}:${pinOf(key)}`,
});
