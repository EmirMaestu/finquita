import { canAuthorize, PERMISSIONS, type Permission, summarizeShift } from "@mostrador/shared";
import { verify } from "@node-rs/argon2";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { loadOverrides } from "../auth/permissions";
import { MAX_PIN_ATTEMPTS, PIN_LOCK_MS, PIN_RE } from "../auth/pin";
import type { Db } from "../db/client";
import {
  cashMovements,
  members,
  registers,
  sales,
  shifts,
  supplierInvoices,
  suppliers,
} from "../db/schema/index";
import { ApiError, notFound } from "../lib/errors";
import { validate } from "../lib/validate";

export const cashRoutes = new Hono<AppEnv>();

async function names(db: Db, ids: (string | null)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map<string, string>();
  const rows = await db
    .select({ id: members.id, name: members.name })
    .from(members)
    .where(inArray(members.id, list));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Cajas con su turno abierto (si hay). */
cashRoutes.get("/registers", requireActor(), async (c) => {
  const db = c.get("db");
  const regs = await db
    .select()
    .from(registers)
    .where(eq(registers.active, true))
    .orderBy(asc(registers.number));
  const open = await db.select().from(shifts).where(eq(shifts.status, "open"));
  const [lastClosed] = await db
    .select()
    .from(shifts)
    .where(eq(shifts.status, "closed"))
    .orderBy(desc(shifts.closedAt))
    .limit(1);
  const who = await names(db, [...open.map((s) => s.memberId), lastClosed?.memberId ?? null]);
  const numbers = await db
    .select({ registerId: sales.registerId, max: sql<number>`max(${sales.number})::int` })
    .from(sales)
    .groupBy(sales.registerId);
  const lastNumber = new Map(numbers.map((n) => [n.registerId, n.max]));
  return c.json(
    regs.map((r) => {
      const s = open.find((x) => x.registerId === r.id);
      const prev = lastClosed?.registerId === r.id ? lastClosed : null;
      return {
        ...r,
        lastSaleNumber: lastNumber.get(r.id) ?? 0,
        openShift: s
          ? {
              id: s.id,
              memberId: s.memberId,
              memberName: who.get(s.memberId) ?? "",
              openedAt: s.openedAt,
              openingFloatCents: s.openingFloatCents,
            }
          : null,
        lastClosed: prev
          ? {
              id: prev.id,
              memberName: who.get(prev.memberId) ?? "",
              closedAt: prev.closedAt,
              leftFloatCents: prev.leftFloatCents,
            }
          : null,
      };
    }),
  );
});

/** Turno: la cuenta del efectivo esperado, el resumen por medio y los movimientos. */
cashRoutes.get("/shifts/:id", requireActor(), async (c) => {
  const db = c.get("db");
  const [s] = await db
    .select()
    .from(shifts)
    .where(eq(shifts.id, c.req.param("id")));
  if (!s) throw notFound("Ese turno no existe.");
  const { member } = actorOf(c);
  if (member.role === "stocker")
    throw new ApiError(403, "forbidden", "No tenés permiso para ver la caja.");
  const moves = await db
    .select()
    .from(cashMovements)
    .where(eq(cashMovements.shiftId, s.id))
    .orderBy(asc(cashMovements.createdAt), asc(cashMovements.id));
  const who = await names(db, [
    s.memberId,
    s.closedBy,
    ...moves.map((m) => m.memberId),
    ...moves.map((m) => m.authorizedBy),
  ]);
  const [reg] = await db.select().from(registers).where(eq(registers.id, s.registerId));
  const summary = summarizeShift(s.openingFloatCents, moves);
  return c.json({
    shift: {
      ...s,
      memberName: who.get(s.memberId) ?? "",
      registerName: reg?.name ?? "Caja",
      toleranceCents: reg?.toleranceCents ?? 50000,
    },
    summary,
    movements: moves.map((m) => ({
      ...m,
      memberName: m.memberId ? (who.get(m.memberId) ?? null) : null,
      authorizedByName: m.authorizedBy ? (who.get(m.authorizedBy) ?? null) : null,
    })),
  });
});

const historyQuery = z.object({
  registerId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(30),
});

/** Historial de turnos (cerrados y el abierto). */
cashRoutes.get("/shifts", requireActor(), validate("query", historyQuery), async (c) => {
  const db = c.get("db");
  const { registerId, limit } = c.req.valid("query");
  const { member } = actorOf(c);
  const rows = await db
    .select()
    .from(shifts)
    .where(
      and(
        registerId ? eq(shifts.registerId, registerId) : undefined,
        member.role === "cashier" ? eq(shifts.memberId, member.id) : undefined,
      ),
    )
    .orderBy(desc(shifts.openedAt))
    .limit(limit);
  const who = await names(
    db,
    rows.map((r) => r.memberId),
  );
  const ids = rows.map((r) => r.id);
  const moves = ids.length
    ? await db.select().from(cashMovements).where(inArray(cashMovements.shiftId, ids))
    : [];
  return c.json(
    rows.map((r) => {
      const sum = summarizeShift(
        r.openingFloatCents,
        moves.filter((m) => m.shiftId === r.id),
      );
      return { ...r, memberName: who.get(r.memberId) ?? "", salesCents: sum.salesCents };
    }),
  );
});

const authorizeBody = z.object({
  pin: z.string().regex(PIN_RE, "El PIN tiene de 4 a 6 números"),
  permission: z.enum(Object.keys(PERMISSIONS) as [Permission, ...Permission[]]),
});

/**
 * "Autorizá con tu PIN": busca qué encargado o dueño tiene ese PIN y puede autorizar la acción.
 * Un PIN equivocado cuenta como intento fallido para todos los que podían autorizar.
 */
cashRoutes.post("/pin/authorize", requireActor(), validate("json", authorizeBody), async (c) => {
  const { pin, permission } = c.req.valid("json");
  const db = c.get("db");
  const now = new Date();
  const candidates = (
    await db
      .select()
      .from(members)
      .where(
        and(eq(members.active, true), ne(members.role, "cashier"), ne(members.role, "stocker")),
      )
  ).filter((m) => m.pinHash && !(m.pinLockedUntil && m.pinLockedUntil > now));
  const eligible = [];
  for (const m of candidates) {
    if (canAuthorize(m.role, permission, await loadOverrides(db, m.id))) eligible.push(m);
  }
  for (const m of eligible) {
    if (await verify(m.pinHash as string, pin).catch(() => false)) {
      if (m.pinFailedAttempts)
        await db.update(members).set({ pinFailedAttempts: 0 }).where(eq(members.id, m.id));
      return c.json({ memberId: m.id, name: m.name, role: m.role });
    }
  }
  for (const m of eligible) {
    const attempts = m.pinFailedAttempts + 1;
    await db
      .update(members)
      .set(
        attempts >= MAX_PIN_ATTEMPTS
          ? { pinFailedAttempts: 0, pinLockedUntil: new Date(now.getTime() + PIN_LOCK_MS) }
          : { pinFailedAttempts: attempts },
      )
      .where(eq(members.id, m.id));
  }
  throw new ApiError(
    403,
    "pin_wrong",
    eligible.length
      ? "Ese PIN no autoriza esto. Pedíselo a un encargado o al dueño."
      : "No hay quien pueda autorizar con PIN ahora: esperá cinco minutos.",
  );
});

/** Facturas pendientes (para pagar desde la caja). */
cashRoutes.get("/supplier-invoices/pending", requireActor(), async (c) => {
  const db = c.get("db");
  const rows = await db
    .select({ inv: supplierInvoices, supplier: suppliers.name })
    .from(supplierInvoices)
    .innerJoin(suppliers, eq(suppliers.id, supplierInvoices.supplierId))
    .where(ne(supplierInvoices.status, "paid"))
    .orderBy(asc(supplierInvoices.dueOn));
  return c.json(
    rows.map((r) => ({
      ...r.inv,
      supplierName: r.supplier,
      pendingCents: r.inv.amountCents - r.inv.paidCents,
    })),
  );
});
