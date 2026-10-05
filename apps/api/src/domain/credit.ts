import {
  addDays,
  creditSummary,
  type DateStr,
  formatMoney,
  newId,
  type OpPayload,
  toDateStr,
} from "@mostrador/shared";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { customerLedger, customers, ledgerAllocations } from "../db/schema/index";
import { raiseAlert } from "./alerts";
import { addCash, getShift } from "./cash";
import { type DbOrTx, need, type OpContext, Rejection } from "./types";

export type Customer = typeof customers.$inferSelect;

export async function getCustomer(tx: DbOrTx, id: string, lock = false): Promise<Customer> {
  const q = tx.select().from(customers).where(eq(customers.id, id));
  const [c] = lock ? await q.for("update") : await q;
  if (!c) throw new Rejection("El cliente no existe");
  return c;
}

/** Vencimiento de una compra fiada según el plazo del cliente. */
export function dueDate(date: DateStr, c: Pick<Customer, "terms" | "termsDays">): DateStr {
  switch (c.terms) {
    case "weekly":
      return addDays(date, 7);
    case "biweekly":
      return addDays(date, 15);
    case "month_end": {
      const [y, m] = date.split("-").map(Number);
      const last = new Date(Date.UTC(y ?? 2026, m ?? 1, 0)).getUTCDate();
      return `${date.slice(0, 7)}-${String(last).padStart(2, "0")}`;
    }
    default:
      return addDays(date, c.termsDays || 30);
  }
}

export async function ledgerOf(tx: DbOrTx, customerId: string) {
  return tx
    .select()
    .from(customerLedger)
    .where(eq(customerLedger.customerId, customerId))
    .orderBy(asc(customerLedger.createdAt), asc(customerLedger.id));
}

export async function summaryOf(tx: DbOrTx, customerId: string, asOf: DateStr) {
  const rows = await ledgerOf(tx, customerId);
  return creditSummary(
    rows.map((r) => ({
      id: r.id,
      amountCents: r.amountCents,
      date: toDateStr(r.createdAt),
      dueOn: r.dueOn,
    })),
    asOf,
  );
}

async function bumpBalance(tx: DbOrTx, customerId: string, delta: number) {
  await tx
    .update(customers)
    .set({ balanceCents: sql`${customers.balanceCents} + ${delta}`, updatedAt: new Date() })
    .where(eq(customers.id, customerId));
}

/**
 * Compra fiada: suma a la cuenta corriente. Por encima del límite o con deuda vencida pide PIN;
 * si vino de la cola sin conexión, se acepta igual (ya ocurrió) y se avisa al dueño.
 */
export async function chargeCredit(
  tx: DbOrTx,
  ctx: OpContext,
  a: { customerId: string; amountCents: number; saleId: string },
): Promise<{ overLimit: boolean; balanceAfter: number }> {
  const c = await getCustomer(tx, a.customerId, true);
  const today = toDateStr(ctx.at);
  const s = await summaryOf(tx, c.id, today);
  const after = s.balanceCents + a.amountCents;
  const overLimit = after > c.creditLimitCents || s.overdueCents > 0;
  if (overLimit) {
    const g = ctx.grant("credit_over_limit");
    const authorized =
      g === "allow" || (ctx.authorizedBy !== null && ctx.canBeAuthorized("credit_over_limit"));
    if (!authorized && !ctx.offline) {
      need(ctx, "credit_over_limit", "Fiado por encima del límite o con deuda vencida");
    }
    if (!authorized) {
      await raiseAlert(tx, {
        kind: "credit_over_limit",
        title: `${c.name}: fiado por encima del límite sin autorización`,
        body: `Saldo después de la compra ${formatMoney(after)}, límite ${formatMoney(c.creditLimitCents)}.`,
        refType: "customer",
        refId: c.id,
        data: { saleId: a.saleId, balanceAfter: after },
      });
    }
  } else {
    need(ctx, "credit_within_limit", "Fiado");
  }
  await tx.insert(customerLedger).values({
    id: newId(),
    customerId: c.id,
    kind: "sale",
    amountCents: a.amountCents,
    dueOn: dueDate(today, c),
    saleId: a.saleId,
    memberId: ctx.memberId,
    authorizedBy: ctx.authorizedBy,
    deviceId: ctx.deviceId,
    deviceAt: ctx.at,
    createdAt: ctx.at,
  });
  await bumpBalance(tx, c.id, a.amountCents);
  return { overLimit, balanceAfter: after };
}

/** Lo que queda abierto de cada compra fiada, según las asignaciones guardadas. */
async function openChargesStored(tx: DbOrTx, customerId: string) {
  const rows = await tx
    .select({
      id: customerLedger.id,
      amountCents: customerLedger.amountCents,
      createdAt: customerLedger.createdAt,
      saleId: customerLedger.saleId,
      allocated: sql<string>`coalesce((select sum(a.amount_cents) from ledger_allocations a where a.charge_id = customer_ledger.id), 0)`,
    })
    .from(customerLedger)
    .where(and(eq(customerLedger.customerId, customerId), sql`${customerLedger.amountCents} > 0`))
    .orderBy(asc(customerLedger.createdAt), asc(customerLedger.id));
  return rows
    .map((r) => ({ ...r, open: r.amountCents - Number(r.allocated) }))
    .filter((r) => r.open > 0);
}

/**
 * Movimiento que baja la deuda (pago, devolución, contramovimiento) y se aplica a las
 * compras más viejas primero, o a las elegidas.
 */
export async function creditDown(
  tx: DbOrTx,
  ctx: OpContext,
  a: {
    id?: string;
    customerId: string;
    amountCents: number;
    kind: "payment" | "refund" | "reversal";
    method?: string | null;
    saleId?: string | null;
    reversesId?: string | null;
    applyTo?: "oldest" | string[];
    note?: string | null;
  },
) {
  const id = a.id ?? newId();
  await tx.insert(customerLedger).values({
    id,
    customerId: a.customerId,
    kind: a.kind,
    amountCents: -a.amountCents,
    method: a.method ?? null,
    saleId: a.saleId ?? null,
    reversesId: a.reversesId ?? null,
    note: a.note ?? null,
    memberId: ctx.memberId,
    deviceId: ctx.deviceId,
    deviceAt: ctx.at,
    createdAt: ctx.at,
  });
  let left = a.amountCents;
  let charges = await openChargesStored(tx, a.customerId);
  if (Array.isArray(a.applyTo)) {
    const chosen = new Set(a.applyTo);
    // Los tickets elegidos primero; si sobra, a lo más viejo.
    charges = [
      ...charges.filter((c) => chosen.has(c.id)),
      ...charges.filter((c) => !chosen.has(c.id)),
    ];
  }
  for (const ch of charges) {
    if (left <= 0) break;
    const used = Math.min(left, ch.open);
    await tx.insert(ledgerAllocations).values({
      id: newId(),
      paymentId: id,
      chargeId: ch.id,
      amountCents: used,
    });
    left -= used;
  }
  await bumpBalance(tx, a.customerId, -a.amountCents);
  return id;
}

/** Cobrar fiado: monto, medio (el efectivo entra a la caja del turno) y a qué deudas. */
export async function creditPayment(tx: DbOrTx, ctx: OpContext, p: OpPayload<"credit.payment">) {
  need(ctx, "sell", "Cobrar fiado");
  await getCustomer(tx, p.customerId, true);
  if (p.method === "cash" && !p.shiftId)
    throw new Rejection("Abrí la caja para cobrar en efectivo");
  if (Array.isArray(p.applyTo)) {
    const found = await tx
      .select({ id: customerLedger.id })
      .from(customerLedger)
      .where(
        and(inArray(customerLedger.id, p.applyTo), eq(customerLedger.customerId, p.customerId)),
      );
    if (found.length !== p.applyTo.length)
      throw new Rejection("Alguno de los tickets elegidos no es de este cliente");
  }
  await creditDown(tx, ctx, {
    id: p.id,
    customerId: p.customerId,
    amountCents: p.amountCents,
    kind: "payment",
    method: p.method,
    applyTo: p.applyTo,
    note: p.note ?? null,
  });
  if (p.shiftId) {
    await getShift(tx, p.shiftId);
    await addCash(tx, {
      shiftId: p.shiftId,
      kind: "credit_payment",
      method: p.method,
      amountCents: p.amountCents,
      refType: "customer_ledger",
      refId: p.id,
      memberId: ctx.memberId,
      deviceId: ctx.deviceId,
      at: ctx.at,
    });
  }
  const [c] = await tx
    .select({ balance: customers.balanceCents })
    .from(customers)
    .where(eq(customers.id, p.customerId));
  return { balanceCents: c?.balance ?? 0 };
}
