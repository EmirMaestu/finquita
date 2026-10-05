import { newId, type PeriodPreset, periodRange, todayAR } from "@mostrador/shared";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { authorize, requireFull } from "../auth/permissions";
import { fixedExpenses } from "../db/schema/index";
import { REPORTS, type ReportKind } from "../domain/reports";
import { ApiError, notFound } from "../lib/errors";
import { validate } from "../lib/validate";

export const reportRoutes = new Hono<AppEnv>();

const query = z.object({
  preset: z.enum(["today", "yesterday", "7d", "month", "last_month", "custom"]).default("month"),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  categoryId: z.uuid().optional(),
});

const NEEDS_PROFIT: ReportKind[] = ["profitability", "result"];

/** Un reporte: la respuesta, el gráfico y el detalle, para el período pedido y el anterior. */
reportRoutes.get("/reports/:kind", requireActor(), validate("query", query), async (c) => {
  const kind = c.req.param("kind") as ReportKind;
  if (!(kind in REPORTS)) throw notFound("Ese reporte no existe.");
  const q = c.req.valid("query");
  const a = await authorize(c, NEEDS_PROFIT.includes(kind) ? "reports_profitability" : "reports");
  // El cajero ("own") ve solo sus ventas.
  if (a.grant !== "allow" && !(a.grant === "own" && kind === "sales")) {
    throw new ApiError(403, "forbidden", "No tenés permiso para ver este reporte.");
  }
  const range = periodRange(
    q.preset as PeriodPreset,
    todayAR(),
    q.from && q.to ? { from: q.from, to: q.to } : undefined,
  );
  if (range.from > range.to)
    throw new ApiError(400, "invalid_range", "La fecha de inicio es después de la de fin.");
  const { member } = actorOf(c);
  const report = await REPORTS[kind](c.get("db"), {
    range,
    categoryId: q.categoryId ?? null,
    memberId: a.grant === "own" ? member.id : null,
  });
  return c.json({ kind, range, ...report });
});

// ── Gastos fijos (para el resultado del mes) ───────────────────────────────────

reportRoutes.get(
  "/fixed-expenses",
  requireActor(),
  requireFull("reports_profitability"),
  async (c) => {
    return c.json(
      await c
        .get("db")
        .select()
        .from(fixedExpenses)
        .where(isNull(fixedExpenses.deletedAt))
        .orderBy(asc(fixedExpenses.name)),
    );
  },
);

const fixedBody = z.object({
  name: z.string().min(1).max(80),
  category: z.enum(["rent", "utilities", "salaries", "taxes", "other"]).default("other"),
  monthlyCents: z.number().int().min(0),
  active: z.boolean().default(true),
});

reportRoutes.post(
  "/fixed-expenses",
  requireActor(),
  requireFull("reports_profitability"),
  validate("json", fixedBody),
  async (c) => {
    const id = newId();
    await c
      .get("db")
      .insert(fixedExpenses)
      .values({ id, ...c.req.valid("json") });
    return c.json({ id }, 201);
  },
);

reportRoutes.patch(
  "/fixed-expenses/:id",
  requireActor(),
  requireFull("reports_profitability"),
  validate("json", fixedBody.partial()),
  async (c) => {
    const [row] = await c
      .get("db")
      .update(fixedExpenses)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(eq(fixedExpenses.id, c.req.param("id")))
      .returning();
    if (!row) throw notFound("Ese gasto no existe.");
    return c.json(row);
  },
);

reportRoutes.delete(
  "/fixed-expenses/:id",
  requireActor(),
  requireFull("reports_profitability"),
  async (c) => {
    await c
      .get("db")
      .update(fixedExpenses)
      .set({ deletedAt: new Date(), active: false })
      .where(and(eq(fixedExpenses.id, c.req.param("id")), isNull(fixedExpenses.deletedAt)));
    return c.json({ ok: true });
  },
);
