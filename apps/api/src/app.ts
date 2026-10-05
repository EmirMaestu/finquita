import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type Actor, type Device, resolveActor } from "./auth/actor";
import { type Auth, type AuthConfig, authConfigFromEnv, createAuth } from "./auth/better-auth";
import type { Authorization } from "./auth/permissions";
import type { Db } from "./db/client";
import { ApiError, notFound } from "./lib/errors";
import { log } from "./lib/log";
import { validationError } from "./lib/validate";
import { authRoutes } from "./routes/auth";

export type AppDeps = { db: Db; auth?: AuthConfig };

export type AppEnv = {
  Variables: {
    db: Db;
    auth: Auth;
    requestId: string;
    device: Device | null;
    actor: Actor | null;
    authz: Authorization;
  };
};

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const auth = createAuth(deps.db, deps.auth ?? authConfigFromEnv());

  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
    c.set("requestId", requestId);
    c.set("db", deps.db);
    c.set("auth", auth);
    const start = performance.now();
    await next();
    c.header("x-request-id", requestId);
    log.info("request", {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - start),
    });
  });

  app.onError((err, c) => {
    const e = err instanceof z.ZodError ? validationError(err) : err;
    if (e instanceof ApiError) {
      return c.json({ error: { code: e.code, message: e.message, details: e.details } }, e.status);
    }
    log.error("error no manejado", {
      requestId: c.get("requestId"),
      path: c.req.path,
      error: e instanceof Error ? { message: e.message, stack: e.stack } : String(e),
    });
    return c.json(
      { error: { code: "internal", message: "Algo salió mal. Probá de nuevo en un momento." } },
      500,
    );
  });

  app.notFound((c) => {
    const e = notFound("Esa dirección no existe.");
    return c.json({ error: { code: e.code, message: e.message } }, 404);
  });

  app.get("/api/health", async (c) => {
    let db: "ok" | "error" = "ok";
    try {
      await c.get("db").execute(sql`select 1`);
    } catch {
      db = "error";
    }
    return c.json({ ok: db === "ok", db, time: new Date().toISOString() }, db === "ok" ? 200 : 503);
  });

  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.use("/api/*", resolveActor());
  app.route("/api", authRoutes);

  return app;
}

export type App = ReturnType<typeof createApp>;
