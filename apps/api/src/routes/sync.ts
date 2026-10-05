import { pushRequest } from "@mostrador/shared";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { validate } from "../lib/validate";
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
