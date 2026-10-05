import { and, eq, gt, isNull } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../app";
import type { Db } from "../db/client";
import { devices, members, pinSessions } from "../db/schema/index";
import { unauthorized } from "../lib/errors";
import { hashToken } from "../lib/tokens";
import type { Member } from "./pin";

export type Device = typeof devices.$inferSelect;

/** Quién hace el pedido: la persona y, si corresponde, el dispositivo. */
export type Actor = {
  member: Member;
  device: Device | null;
  via: "password" | "pin";
};

export const DEVICE_HEADER = "x-device-token";

export async function deviceFromToken(db: Db, token: string | undefined): Promise<Device | null> {
  if (!token) return null;
  const [d] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.tokenHash, hashToken(token)), isNull(devices.revokedAt)))
    .limit(1);
  return d ?? null;
}

function bearer(c: Context): string | undefined {
  const h = c.req.header("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : undefined;
}

/** Resuelve el actor: primero la sesión con PIN del dispositivo, después la cuenta. */
export function resolveActor(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const db = c.get("db");
    const device = await deviceFromToken(db, c.req.header(DEVICE_HEADER));
    c.set("device", device);
    let actor: Actor | null = null;

    const pinToken = bearer(c);
    if (pinToken && device) {
      const [row] = await db
        .select({ member: members })
        .from(pinSessions)
        .innerJoin(members, eq(members.id, pinSessions.memberId))
        .where(
          and(
            eq(pinSessions.tokenHash, hashToken(pinToken)),
            eq(pinSessions.deviceId, device.id),
            gt(pinSessions.expiresAt, new Date()),
            eq(members.active, true),
          ),
        )
        .limit(1);
      if (row) actor = { member: row.member, device, via: "pin" };
    }

    if (!actor) {
      const session = await c.get("auth").api.getSession({ headers: c.req.raw.headers });
      if (session) {
        const [m] = await db
          .select()
          .from(members)
          .where(and(eq(members.authUserId, session.user.id), eq(members.active, true)))
          .limit(1);
        if (m) actor = { member: m, device, via: "password" };
      }
    }

    c.set("actor", actor);
    await next();
  };
}

export function requireActor(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!c.get("actor")) throw unauthorized();
    await next();
  };
}

export function actorOf(c: Context<AppEnv>): Actor {
  const a = c.get("actor");
  if (!a) throw unauthorized();
  return a;
}
