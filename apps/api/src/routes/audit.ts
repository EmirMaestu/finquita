import { addDays, arDateTime } from "@mostrador/shared";
import { and, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireActor } from "../auth/actor";
import { requirePermission } from "../auth/permissions";
import { auditLog, devices, members } from "../db/schema/index";
import { validate } from "../lib/validate";

const filters = z.object({
  memberId: z.uuid().optional(),
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(80).optional(),
  action: z.string().max(60).optional(),
  /** Fechas AAAA-MM-DD en horario de Argentina (inclusive). */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  before: z.iso.datetime({ offset: true }).optional(),
});

export const auditRoutes = new Hono<AppEnv>();

/** Ajustes > Actividad: registro de auditoría con filtros por usuario, tipo y fecha. */
auditRoutes.get(
  "/audit",
  requireActor(),
  requirePermission("settings"),
  validate("query", filters),
  async (c) => {
    const f = c.req.valid("query");
    const where: SQL[] = [];
    if (f.memberId) where.push(eq(auditLog.memberId, f.memberId));
    if (f.entityType) where.push(eq(auditLog.entityType, f.entityType));
    if (f.entityId) where.push(eq(auditLog.entityId, f.entityId));
    if (f.action) where.push(eq(auditLog.action, f.action));
    if (f.from) where.push(gte(auditLog.createdAt, arDateTime(f.from)));
    if (f.to) where.push(lt(auditLog.createdAt, arDateTime(addDays(f.to, 1))));
    if (f.before) where.push(lt(auditLog.createdAt, new Date(f.before)));
    const rows = await c
      .get("db")
      .select({
        entry: auditLog,
        memberName: members.name,
        deviceName: devices.name,
      })
      .from(auditLog)
      .leftJoin(members, eq(members.id, auditLog.memberId))
      .leftJoin(devices, eq(devices.id, auditLog.deviceId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(f.limit);
    return c.json(
      rows.map((r) => ({ ...r.entry, memberName: r.memberName, deviceName: r.deviceName })),
    );
  },
);
