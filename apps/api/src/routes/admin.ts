// apps/api/src/routes/admin.ts
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  ADMIN_COOKIE,
  type AdminConfig,
  checkPassword,
  LoginLimiter,
  SESSION_MS,
  signSession,
  verifySession,
} from "../admin/session";
import { BACKUP_RE, listBackups, systemStatus } from "../admin/status";
import { AdminError, listUsers, resetPassword, resetPin } from "../admin/users";
import { errorPage, type Flash, loginPage, panelPage } from "../admin/views";
import type { AppEnv } from "../app";
import { log } from "../lib/log";

const clientIp = (h: string | undefined) => h?.split(",")[0]?.trim() || "local";

export function adminRoutes(cfg: AdminConfig) {
  const r = new Hono<AppEnv>();
  const limiter = new LoginLimiter();

  // Sin contraseña configurada, el panel no existe.
  r.use("*", async (c, next) => {
    if (!cfg.password) return c.notFound();
    c.header("Cache-Control", "no-store");
    c.header("X-Frame-Options", "DENY");
    await next();
  });

  // Los formularios solo valen desde el mismo sitio.
  r.use("*", async (c, next) => {
    if (c.req.method === "POST" && c.req.header("origin") !== cfg.origin) {
      return c.text("Origen no permitido", 403);
    }
    await next();
  });

  r.onError((err, c) => {
    log.error("panel de admin", {
      requestId: c.get("requestId"),
      error: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
    });
    return c.html(errorPage(c.get("requestId")), 500);
  });

  r.get("/login", (c) => c.html(loginPage()));

  r.post("/login", async (c) => {
    const ip = clientIp(c.req.header("x-forwarded-for"));
    // Se cuenta antes de cualquier await; si no, los pedidos en paralelo se saltean el límite.
    if (!limiter.attempt(ip)) {
      return c.html(loginPage("Demasiados intentos. Probá de nuevo en 15 minutos."), 429);
    }
    const body = await c.req.parseBody();
    const password = typeof body.password === "string" ? body.password : "";
    if (!checkPassword(cfg, password)) {
      log.warn("panel de admin: contraseña incorrecta", { ip });
      return c.html(loginPage("Contraseña incorrecta."), 401);
    }
    limiter.success(ip);
    setCookie(c, ADMIN_COOKIE, signSession(cfg), {
      path: "/api/admin",
      httpOnly: true,
      secure: cfg.secure,
      sameSite: "Strict",
      maxAge: SESSION_MS / 1000,
    });
    log.info("panel de admin: ingreso", { ip });
    return c.redirect("/api/admin", 302);
  });

  // De acá para abajo, hace falta sesión.
  r.use("*", async (c, next) => {
    if (!verifySession(cfg, getCookie(c, ADMIN_COOKIE))) {
      return c.redirect("/api/admin/login", 302);
    }
    await next();
  });

  r.post("/logout", (c) => {
    deleteCookie(c, ADMIN_COOKIE, { path: "/api/admin" });
    return c.redirect("/api/admin/login", 302);
  });

  const render = async (db: AppEnv["Variables"]["db"], flash?: Flash) => {
    const status = await systemStatus(db, cfg);
    const users = status.db.ok ? await listUsers(db).catch(() => null) : null;
    const backups = await listBackups(cfg.backupsDir);
    return panelPage({ status, users, backups, flash });
  };

  r.get("/", async (c) => c.html(await render(c.get("db"))));

  r.post("/users/:id/password", async (c) => {
    const db = c.get("db");
    try {
      const temp = await resetPassword(db, c.req.param("id"));
      return c.html(
        await render(db, {
          kind: "ok",
          text: "Contraseña temporal (se muestra solo esta vez; pedile que la cambie):",
          secret: temp,
        }),
      );
    } catch (err) {
      if (!(err instanceof AdminError)) throw err;
      return c.html(await render(db, { kind: "error", text: err.message }), 400);
    }
  });

  r.post("/users/:id/pin", async (c) => {
    const db = c.get("db");
    const body = await c.req.parseBody();
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";
    try {
      await resetPin(db, c.req.param("id"), pin);
      return c.html(await render(db, { kind: "ok", text: "PIN de la persona actualizado." }));
    } catch (err) {
      if (!(err instanceof AdminError)) throw err;
      return c.html(await render(db, { kind: "error", text: err.message }), 400);
    }
  });

  r.get("/backups/:name", async (c) => {
    const name = c.req.param("name");
    if (!BACKUP_RE.test(name)) return c.text("Nombre de copia inválido", 400);
    const path = join(cfg.backupsDir, name);
    const s = await stat(path).catch(() => null);
    if (!s?.isFile()) return c.text("Esa copia no existe", 404);
    const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(s.size),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  });

  return r;
}
