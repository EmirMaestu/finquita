import { pushRequest } from "@mostrador/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { loadOverrides } from "../auth/permissions";
import { validate } from "../lib/validate";
import { pullChanges } from "../sync/pull";
import { pushOps } from "../sync/push";

export const syncRoutes = new Hono<AppEnv>();

/** El dispositivo manda su cola en orden, en lotes de hasta 100. */
syncRoutes.post("/sync/push", requireActor(), validate("json", pushRequest), async (c) => {
  const body = c.req.valid("json");
  const res = await pushOps(c.get("db"), {
    actor: actorOf(c),
    deviceNow: new Date(body.deviceNow),
    ops: body.ops,
  });
  c.get("onSyncApplied")?.(res);
  return c.json(res);
});

const pullQuery = z.object({
  since: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
});

/** Cambios de productos, precios, códigos, clientes, saldos y ajustes desde el cursor. */
syncRoutes.get("/sync/pull", requireActor(), validate("query", pullQuery), async (c) => {
  const { since, limit } = c.req.valid("query");
  const { member } = actorOf(c);
  const db = c.get("db");
  const overrides = await loadOverrides(db, member.id);
  return c.json(await pullChanges(db, { role: member.role, overrides }, since, limit));
});
