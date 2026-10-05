import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { type AppEnv, createApp } from "../src/app";
import { createDb } from "../src/db/client";
import { ApiError } from "../src/lib/errors";
import { validate } from "../src/lib/validate";
import { createTestDb, type TestDb } from "./db";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

describe("/api/health", () => {
  it("responde ok con la base conectada", async () => {
    const app = createApp({ db: t.db });
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, db: "ok" });
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("responde 503 si la base no contesta", async () => {
    const { db, sql } = createDb("postgres://nadie:nada@127.0.0.1:1/x", { max: 1 });
    const res = await createApp({ db }).request("/api/health");
    expect(res.status).toBe(503);
    await sql.end();
  });
});

describe("errores y validación", () => {
  const build = () => {
    const app = createApp({ db: t.db }) as unknown as Hono<AppEnv>;
    app.post("/api/test", validate("json", z.object({ monto: z.number().int() })), (c) =>
      c.json({ monto: c.req.valid("json").monto }),
    );
    app.get("/api/boom", () => {
      throw new Error("explotó");
    });
    app.get("/api/negado", () => {
      throw new ApiError(403, "forbidden", "Pedile permiso al dueño.");
    });
    return app;
  };

  it("valida el cuerpo con Zod", async () => {
    const app = build();
    const ok = await app.request("/api/test", {
      method: "POST",
      body: JSON.stringify({ monto: 1200 }),
      headers: { "content-type": "application/json" },
    });
    expect(await ok.json()).toEqual({ monto: 1200 });
    const bad = await app.request("/api/test", {
      method: "POST",
      body: JSON.stringify({ monto: "mil" }),
      headers: { "content-type": "application/json" },
    });
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { error: { code: string; details: { path: string }[] } };
    expect(body.error.code).toBe("validation");
    expect(body.error.details[0]?.path).toBe("monto");
  });

  it("no expone errores internos", async () => {
    const res = await build().request("/api/boom");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).not.toContain("explotó");
  });

  it("devuelve los ApiError con su código", async () => {
    const res = await build().request("/api/negado");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "forbidden" } });
  });

  it("404 en JSON", async () => {
    const res = await build().request("/api/nada");
    expect(res.status).toBe(404);
  });
});
