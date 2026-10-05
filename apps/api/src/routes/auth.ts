import { effectiveGrants, formatTime, newId } from "@mostrador/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { loadOverrides } from "../auth/permissions";
import { hashPin, PIN_RE, verifyMemberPin } from "../auth/pin";
import { devices, members, pinSessions } from "../db/schema/index";
import { auditFrom } from "../lib/audit";
import { ApiError, forbidden, notFound } from "../lib/errors";
import { hashToken, newToken } from "../lib/tokens";
import { validate } from "../lib/validate";

const PIN_SESSION_MS = 12 * 60 * 60_000;

export const authRoutes = new Hono<AppEnv>();

/** Quién soy. */
authRoutes.get("/me", requireActor(), async (c) => {
  const { member, device, via } = actorOf(c);
  const overrides = await loadOverrides(c.get("db"), member.id);
  return c.json({
    member: { id: member.id, name: member.name, role: member.role, email: member.email },
    permissions: effectiveGrants(member.role, overrides),
    device: device ? { id: device.id, name: device.name, registerId: device.registerId } : null,
    via,
  });
});

/** Personas que pueden entrar con PIN en este dispositivo (cambio rápido de usuario). */
authRoutes.get("/pin/members", async (c) => {
  const device = c.get("device");
  if (!device)
    throw forbidden("Este dispositivo no está habilitado. Pedile al dueño que lo habilite.");
  const rows = await c
    .get("db")
    .select({ id: members.id, name: members.name, role: members.role, pinHash: members.pinHash })
    .from(members)
    .where(eq(members.active, true));
  return c.json(rows.map(({ pinHash, ...m }) => ({ ...m, hasPin: Boolean(pinHash) })));
});

const pinLogin = z.object({ memberId: z.uuid(), pin: z.string() });

/** Entrar con PIN en un dispositivo habilitado. */
authRoutes.post("/pin/login", validate("json", pinLogin), async (c) => {
  const device = c.get("device");
  if (!device)
    throw forbidden("Este dispositivo no está habilitado. Pedile al dueño que lo habilite.");
  const { memberId, pin } = c.req.valid("json");
  const db = c.get("db");
  const r = await verifyMemberPin(db, memberId, pin);
  if (!r.ok) {
    if (r.reason === "locked") {
      throw new ApiError(
        423,
        "pin_locked",
        `Demasiados intentos. Probá de nuevo a las ${formatTime(r.lockedUntil)}.`,
        { lockedUntil: r.lockedUntil.toISOString() },
      );
    }
    if (r.reason === "wrong") {
      throw new ApiError(401, "pin_wrong", "El PIN no es correcto.", {
        attemptsLeft: r.attemptsLeft,
      });
    }
    if (r.reason === "no_pin") {
      throw new ApiError(
        400,
        "pin_missing",
        "Esta persona todavía no tiene PIN. Lo carga el dueño.",
      );
    }
    throw notFound("No encontramos a esa persona.");
  }
  const token = newToken();
  await db.insert(pinSessions).values({
    tokenHash: hashToken(token),
    memberId: r.member.id,
    deviceId: device.id,
    expiresAt: new Date(Date.now() + PIN_SESSION_MS),
  });
  await db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, device.id));
  return c.json({
    token,
    member: { id: r.member.id, name: r.member.name, role: r.member.role },
  });
});

authRoutes.post("/pin/logout", async (c) => {
  const h = c.req.header("authorization");
  if (h?.startsWith("Bearer ")) {
    await c
      .get("db")
      .delete(pinSessions)
      .where(eq(pinSessions.tokenHash, hashToken(h.slice(7))));
  }
  return c.json({ ok: true });
});

const setPin = z.object({
  pin: z.string().regex(PIN_RE, "El PIN tiene que tener de 4 a 6 números"),
});

/** El dueño carga el PIN de cualquiera; cada uno puede cambiar el suyo. */
authRoutes.put("/members/:id/pin", requireActor(), validate("json", setPin), async (c) => {
  const actor = actorOf(c);
  const id = c.req.param("id");
  if (actor.member.role !== "owner" && actor.member.id !== id) {
    throw forbidden("Solo el dueño puede cambiar el PIN de otra persona.");
  }
  const pinHash = await hashPin(c.req.valid("json").pin);
  const updated = await c
    .get("db")
    .update(members)
    .set({ pinHash, pinFailedAttempts: 0, pinLockedUntil: null, updatedAt: new Date() })
    .where(eq(members.id, id))
    .returning({ id: members.id });
  if (!updated.length) throw notFound("No encontramos a esa persona.");
  await auditFrom(c, c.get("db"), {
    action: "member.pin_changed",
    entityType: "member",
    entityId: id,
  });
  return c.json({ ok: true });
});

const enableDevice = z.object({
  name: z.string().min(1).max(60),
  kind: z.enum(["mac", "iphone", "tablet", "other"]).default("other"),
  registerId: z.uuid().optional(),
});

function requireOwnerPassword(c: Parameters<typeof actorOf>[0]) {
  const actor = actorOf(c);
  if (actor.member.role !== "owner") throw forbidden("Solo el dueño habilita dispositivos.");
  return actor;
}

/** El dueño habilita este dispositivo: devuelve el token una sola vez. */
authRoutes.post("/devices", requireActor(), validate("json", enableDevice), async (c) => {
  const actor = requireOwnerPassword(c);
  const body = c.req.valid("json");
  const token = newToken();
  const id = newId();
  await c
    .get("db")
    .insert(devices)
    .values({
      id,
      name: body.name,
      kind: body.kind,
      registerId: body.registerId ?? null,
      tokenHash: hashToken(token),
      enabledBy: actor.member.id,
      enabledAt: new Date(),
    });
  await auditFrom(c, c.get("db"), {
    action: "device.enabled",
    entityType: "device",
    entityId: id,
    after: { name: body.name, kind: body.kind },
  });
  return c.json({ device: { id, name: body.name, kind: body.kind }, token }, 201);
});

authRoutes.get("/devices", requireActor(), async (c) => {
  requireOwnerPassword(c);
  const rows = await c.get("db").select().from(devices).orderBy(devices.createdAt);
  return c.json(rows.map(({ tokenHash, ...d }) => d));
});

/** Revocar: el dispositivo deja de poder entrar con PIN. */
authRoutes.delete("/devices/:id", requireActor(), async (c) => {
  requireOwnerPassword(c);
  const id = c.req.param("id");
  const db = c.get("db");
  const updated = await db
    .update(devices)
    .set({ revokedAt: new Date() })
    .where(and(eq(devices.id, id)))
    .returning({ id: devices.id });
  if (!updated.length) throw notFound("No encontramos ese dispositivo.");
  await db.delete(pinSessions).where(eq(pinSessions.deviceId, id));
  await auditFrom(c, db, { action: "device.revoked", entityType: "device", entityId: id });
  return c.json({ ok: true });
});
