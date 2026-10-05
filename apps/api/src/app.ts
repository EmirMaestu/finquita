import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type Actor, type Device, resolveActor } from "./auth/actor";
import { type Auth, type AuthConfig, authConfigFromEnv, createAuth } from "./auth/better-auth";
import type { Authorization } from "./auth/permissions";
import type { Db } from "./db/client";
import { ApiError, notFound } from "./lib/errors";
import { EventHub } from "./lib/events";
import { log } from "./lib/log";
import { OffClient, type OffConfig, offConfigFromEnv } from "./lib/off";
import { validationError } from "./lib/validate";
import { alertRoutes } from "./routes/alerts";
import { auditRoutes } from "./routes/audit";
import { authRoutes } from "./routes/auth";
import { cashRoutes } from "./routes/cash";
import { catalogRoutes } from "./routes/catalog";
import { countRoutes } from "./routes/counts";
import { customerRoutes } from "./routes/customers";
import { dashboardRoutes } from "./routes/dashboard";
import { eventRoutes } from "./routes/events";
import { fileRoutes } from "./routes/files";
import { importRoutes } from "./routes/import";
import { labelRoutes } from "./routes/labels";
import { offRoutes } from "./routes/off";
import { orderRoutes } from "./routes/orders";
import { payableRoutes } from "./routes/payables";
import { priceRoutes } from "./routes/prices";
import { promotionRoutes } from "./routes/promotions";
import { purchasingRoutes } from "./routes/purchasing";
import { receiptRoutes } from "./routes/receipts";
import { reportRoutes } from "./routes/reports";
import { salesRoutes } from "./routes/sales";
import { settingsRoutes } from "./routes/settings";
import { setupRoutes } from "./routes/setup";
import { stockRoutes } from "./routes/stock";
import { supplierRoutes } from "./routes/suppliers";
import { syncRoutes } from "./routes/sync";

export type AppDeps = { db: Db; auth?: AuthConfig; events?: EventHub; off?: Partial<OffConfig> };

export type AppEnv = {
  Variables: {
    db: Db;
    auth: Auth;
    requestId: string;
    device: Device | null;
    actor: Actor | null;
    authz: Authorization;
    events: EventHub;
    off: OffClient;
  };
};

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const auth = createAuth(deps.db, deps.auth ?? authConfigFromEnv());
  const events = deps.events ?? new EventHub();
  const off = new OffClient(deps.db, { ...offConfigFromEnv(), ...deps.off });

  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
    c.set("requestId", requestId);
    c.set("db", deps.db);
    c.set("auth", auth);
    c.set("events", events);
    c.set("off", off);
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
  app.route("/api", auditRoutes);
  app.route("/api", syncRoutes);
  app.route("/api", catalogRoutes);
  app.route("/api", offRoutes);
  app.route("/api", importRoutes);
  app.route("/api", labelRoutes);
  app.route("/api", cashRoutes);
  app.route("/api", salesRoutes);
  app.route("/api", stockRoutes);
  app.route("/api", priceRoutes);
  app.route("/api", countRoutes);
  app.route("/api", promotionRoutes);
  app.route("/api", supplierRoutes);
  app.route("/api", purchasingRoutes);
  app.route("/api", orderRoutes);
  app.route("/api", receiptRoutes);
  app.route("/api", fileRoutes);
  app.route("/api", payableRoutes);
  app.route("/api", customerRoutes);
  app.route("/api", alertRoutes);
  app.route("/api", dashboardRoutes);
  app.route("/api", reportRoutes);
  app.route("/api", settingsRoutes);
  app.route("/api", setupRoutes);
  app.route("/api", eventRoutes());

  return app;
}

export type App = ReturnType<typeof createApp>;
