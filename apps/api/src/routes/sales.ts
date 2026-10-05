import { addDays, arDateTime, effectiveGrant } from "@mostrador/shared";
import { and, desc, eq, gte, inArray, lt, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { loadOverrides } from "../auth/permissions";
import {
  auditLog,
  customers,
  devices,
  members,
  registers,
  saleLines,
  salePayments,
  saleReturnLines,
  saleReturns,
  sales,
} from "../db/schema/index";
import { ApiError, notFound } from "../lib/errors";
import { validate } from "../lib/validate";

export const salesRoutes = new Hono<AppEnv>();

const listQuery = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  memberId: z.uuid().optional(),
  method: z.enum(["cash", "debit", "credit", "transfer", "qr", "account"]).optional(),
  status: z.enum(["completed", "voided", "returned"]).optional(),
  number: z.coerce.number().int().positive().optional(),
  customerId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/** Historial de ventas con filtros (fecha, cajero, medio, estado) y búsqueda por número. */
salesRoutes.get("/sales", requireActor(), validate("query", listQuery), async (c) => {
  const db = c.get("db");
  const f = c.req.valid("query");
  const { member } = actorOf(c);
  const grant = effectiveGrant(member.role, "reports", await loadOverrides(db, member.id));
  if (member.role === "stocker" || grant === "deny")
    throw new ApiError(403, "forbidden", "No tenés permiso para ver las ventas.");
  const where: SQL[] = [];
  // El cajero ve solo lo suyo.
  if (grant === "own" || member.role === "cashier") where.push(eq(sales.memberId, member.id));
  if (f.from) where.push(gte(sales.deviceAt, arDateTime(f.from)));
  if (f.to) where.push(lt(sales.deviceAt, arDateTime(addDays(f.to, 1))));
  if (f.memberId) where.push(eq(sales.memberId, f.memberId));
  if (f.number) where.push(eq(sales.number, f.number));
  if (f.customerId) where.push(eq(sales.customerId, f.customerId));
  if (f.status === "completed" || f.status === "voided") where.push(eq(sales.status, f.status));
  if (f.status === "returned")
    where.push(
      sql`exists (select 1 from ${saleReturns} where ${saleReturns.saleId} = ${sales.id})`,
    );
  if (f.method)
    where.push(
      sql`exists (select 1 from ${salePayments} where ${salePayments.saleId} = ${sales.id} and ${salePayments.method} = ${f.method})`,
    );
  const rows = await db
    .select({ s: sales, memberName: members.name, customerName: customers.name })
    .from(sales)
    .leftJoin(members, eq(members.id, sales.memberId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(sales.deviceAt))
    .limit(f.limit);
  const ids = rows.map((r) => r.s.id);
  const pays = ids.length
    ? await db.select().from(salePayments).where(inArray(salePayments.saleId, ids))
    : [];
  const rets = ids.length
    ? await db
        .select({ saleId: saleReturns.saleId, total: saleReturns.totalCents })
        .from(saleReturns)
        .where(inArray(saleReturns.saleId, ids))
    : [];
  return c.json(
    rows.map((r) => ({
      ...r.s,
      memberName: r.memberName,
      customerName: r.customerName,
      methods: [...new Set(pays.filter((p) => p.saleId === r.s.id).map((p) => p.method))],
      returnedCents: rets.filter((x) => x.saleId === r.s.id).reduce((a, x) => a + x.total, 0),
    })),
  );
});

/** Detalle: ítems, pagos, cliente, devoluciones e historial. */
salesRoutes.get("/sales/:id", requireActor(), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const [row] = await db
    .select({
      s: sales,
      memberName: members.name,
      customerName: customers.name,
      registerName: registers.name,
      deviceName: devices.name,
    })
    .from(sales)
    .leftJoin(members, eq(members.id, sales.memberId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .leftJoin(registers, eq(registers.id, sales.registerId))
    .leftJoin(devices, eq(devices.id, sales.deviceId))
    .where(eq(sales.id, id));
  if (!row) throw notFound("Esa venta no existe.");
  const { member } = actorOf(c);
  if (member.role === "stocker" || (member.role === "cashier" && row.s.memberId !== member.id)) {
    throw new ApiError(403, "forbidden", "Solo podés ver tus ventas.");
  }
  const lines = await db
    .select()
    .from(saleLines)
    .where(eq(saleLines.saleId, id))
    .orderBy(saleLines.position);
  const payments = await db.select().from(salePayments).where(eq(salePayments.saleId, id));
  const returns = await db.select().from(saleReturns).where(eq(saleReturns.saleId, id));
  const returnLines = returns.length
    ? await db
        .select()
        .from(saleReturnLines)
        .where(
          inArray(
            saleReturnLines.returnId,
            returns.map((r) => r.id),
          ),
        )
    : [];
  const who = new Map(
    (await db.select({ id: members.id, name: members.name }).from(members)).map((m) => [
      m.id,
      m.name,
    ]),
  );
  const timeline = [
    {
      at: row.s.deviceAt,
      text: `Cobrada por ${row.memberName ?? ""}${row.deviceName ? ` · ${row.deviceName}` : ""}`,
    },
    ...returns.map((r) => ({
      at: r.deviceAt ?? r.createdAt,
      text: `Devolución por ${who.get(r.memberId ?? "") ?? ""}${r.authorizedBy ? `, autorizó ${who.get(r.authorizedBy) ?? ""}` : ""}`,
    })),
    ...(row.s.voidedAt
      ? [
          {
            at: row.s.voidedAt,
            text: `Anulada por ${who.get(row.s.voidedBy ?? "") ?? ""}: ${row.s.voidReason ?? ""}`,
          },
        ]
      : []),
  ];
  const audits = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityType, "sale"), eq(auditLog.entityId, id)));
  return c.json({
    ...row.s,
    memberName: row.memberName,
    customerName: row.customerName,
    registerName: row.registerName,
    lines: lines.map((l) => {
      const { unitCostCents, ...rest } = l;
      return rest;
    }),
    payments,
    returns: returns.map((r) => ({ ...r, lines: returnLines.filter((l) => l.returnId === r.id) })),
    timeline: [...timeline, ...audits.map((a) => ({ at: a.createdAt, text: a.action }))].sort(
      (a, b) => (new Date(a.at) < new Date(b.at) ? -1 : 1),
    ),
  });
});
