import { alertFor, alertPath, DEFAULT_ALERTS, newId } from "@mostrador/shared";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { alertReads, alerts, pushSubscriptions, settings } from "../db/schema/index";
import { notFound } from "../lib/errors";
import { vapid, webPushSender } from "../lib/push";
import { validate } from "../lib/validate";

export const alertRoutes = new Hono<AppEnv>();

type Ctx = Parameters<typeof actorOf>[0];

async function visibleKinds(c: Ctx) {
  const { member } = actorOf(c);
  const [cfg] = await c.get("db").select().from(settings).where(eq(settings.key, "alerts"));
  const matrix = { ...DEFAULT_ALERTS, ...((cfg?.value as object) ?? {}) };
  return (Object.keys(matrix) as (keyof typeof matrix)[]).filter((k) =>
    alertFor(matrix, k, member.role, "app"),
  );
}

const listQuery = z.object({
  filter: z.enum(["unread", "open", "all"]).default("open"),
  kind: z.string().max(40).optional(),
});

/** Centro de avisos: lo que el rol ve según la matriz, con leído por persona. */
alertRoutes.get("/alerts", requireActor(), validate("query", listQuery), async (c) => {
  const { filter, kind } = c.req.valid("query");
  const { member } = actorOf(c);
  const kinds = await visibleKinds(c);
  if (!kinds.length) return c.json({ items: [], unread: 0 });
  const db = c.get("db");
  const rows = await db
    .select({ a: alerts, readAt: alertReads.readAt })
    .from(alerts)
    .leftJoin(
      alertReads,
      and(eq(alertReads.alertId, alerts.id), eq(alertReads.memberId, member.id)),
    )
    .where(
      and(
        inArray(alerts.kind, kinds),
        kind ? eq(alerts.kind, kind as (typeof kinds)[number]) : undefined,
        filter === "all" ? undefined : eq(alerts.status, "open"),
      ),
    )
    .orderBy(desc(alerts.createdAt))
    .limit(200);
  const items = rows.map((r) => ({ ...r.a, read: !!r.readAt, path: alertPath(r.a) }));
  const unread = items.filter((i) => i.status === "open" && !i.read).length;
  return c.json({ items: filter === "unread" ? items.filter((i) => !i.read) : items, unread });
});

alertRoutes.get("/alerts/count", requireActor(), async (c) => {
  const { member } = actorOf(c);
  const kinds = await visibleKinds(c);
  if (!kinds.length) return c.json({ unread: 0 });
  const [r] = await c
    .get("db")
    .select({ n: sql<number>`count(*)::int` })
    .from(alerts)
    .leftJoin(
      alertReads,
      and(eq(alertReads.alertId, alerts.id), eq(alertReads.memberId, member.id)),
    )
    .where(
      and(
        inArray(alerts.kind, kinds),
        eq(alerts.status, "open"),
        sql`${alertReads.readAt} is null`,
      ),
    );
  return c.json({ unread: r?.n ?? 0 });
});

async function mark(c: Ctx, ids: string[]) {
  const { member } = actorOf(c);
  if (!ids.length) return;
  await c
    .get("db")
    .insert(alertReads)
    .values(ids.map((alertId) => ({ alertId, memberId: member.id })))
    .onConflictDoNothing();
}

alertRoutes.post("/alerts/read-all", requireActor(), async (c) => {
  const kinds = await visibleKinds(c);
  const open = kinds.length
    ? await c
        .get("db")
        .select({ id: alerts.id })
        .from(alerts)
        .where(and(inArray(alerts.kind, kinds), eq(alerts.status, "open")))
    : [];
  await mark(
    c,
    open.map((o) => o.id),
  );
  return c.json({ ok: true, read: open.length });
});

alertRoutes.post("/alerts/:id/read", requireActor(), async (c) => {
  await mark(c, [c.req.param("id")]);
  return c.json({ ok: true });
});

/** Posponer: vuelve a aparecer (y a sonar) cuando se cumple el plazo. */
alertRoutes.post(
  "/alerts/:id/snooze",
  requireActor(),
  validate(
    "json",
    z.object({
      hours: z
        .number()
        .min(0.25)
        .max(24 * 14),
    }),
  ),
  async (c) => {
    const until = new Date(Date.now() + c.req.valid("json").hours * 3_600_000);
    const [row] = await c
      .get("db")
      .update(alerts)
      .set({ status: "snoozed", snoozedUntil: until })
      .where(eq(alerts.id, c.req.param("id")))
      .returning();
    if (!row) throw notFound("Ese aviso no existe.");
    return c.json({ ok: true, snoozedUntil: until });
  },
);

alertRoutes.post("/alerts/:id/resolve", requireActor(), async (c) => {
  const { member } = actorOf(c);
  const [row] = await c
    .get("db")
    .update(alerts)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedBy: member.id })
    .where(and(eq(alerts.id, c.req.param("id")), ne(alerts.status, "resolved")))
    .returning();
  if (!row) throw notFound("Ese aviso no existe o ya está resuelto.");
  return c.json({ ok: true });
});

// ── Web Push ────────────────────────────────────────────────────────────────

alertRoutes.get("/push/key", requireActor(), (c) =>
  c.json({ publicKey: vapid()?.publicKey ?? null }),
);

const subBody = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

alertRoutes.post("/push/subscriptions", requireActor(), validate("json", subBody), async (c) => {
  const b = c.req.valid("json");
  const { member, device } = actorOf(c);
  await c
    .get("db")
    .insert(pushSubscriptions)
    .values({
      id: newId(),
      memberId: member.id,
      deviceId: device?.id ?? null,
      endpoint: b.endpoint,
      p256dh: b.keys.p256dh,
      auth: b.keys.auth,
      userAgent: c.req.header("user-agent")?.slice(0, 200) ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { memberId: member.id, p256dh: b.keys.p256dh, auth: b.keys.auth },
    });
  return c.json({ ok: true }, 201);
});

alertRoutes.delete(
  "/push/subscriptions",
  requireActor(),
  validate("json", z.object({ endpoint: z.string().max(1000) })),
  async (c) => {
    await c
      .get("db")
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, c.req.valid("json").endpoint));
    return c.json({ ok: true });
  },
);

/** Notificación de prueba a los navegadores de quien la pide. */
alertRoutes.post("/push/test", requireActor(), async (c) => {
  const { member } = actorOf(c);
  const send = webPushSender();
  if (!send) return c.json({ sent: 0, reason: "Faltan las claves VAPID en el servidor." });
  const subs = await c
    .get("db")
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.memberId, member.id));
  let sent = 0;
  for (const s of subs)
    if (
      (await send(s, {
        title: "Mostrador",
        body: "Las notificaciones funcionan en este dispositivo.",
        url: "/avisos",
        tag: "test",
      })) === "ok"
    )
      sent++;
  return c.json({ sent });
});
