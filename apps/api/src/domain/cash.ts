import {
  closeNotice,
  formatMoney,
  newId,
  type OpPayload,
  shiftName,
  summarizeShift,
} from "@mostrador/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  type CashMovementKind,
  cashMovements,
  members,
  type PaymentMethod,
  registers,
  shifts,
  supplierInvoices,
  supplierPayments,
} from "../db/schema/index";
import { raiseAlert } from "./alerts";
import { type DbOrTx, need, type OpContext, Rejection } from "./types";

export type Shift = typeof shifts.$inferSelect;

export async function getShift(tx: DbOrTx, id: string, lock = false): Promise<Shift> {
  const q = tx.select().from(shifts).where(eq(shifts.id, id));
  const [s] = lock ? await q.for("update") : await q;
  if (!s) throw new Rejection("El turno de caja no existe");
  return s;
}

export async function openShiftOf(tx: DbOrTx, registerId: string): Promise<Shift | null> {
  const [s] = await tx
    .select()
    .from(shifts)
    .where(and(eq(shifts.registerId, registerId), eq(shifts.status, "open")))
    .orderBy(desc(shifts.openedAt))
    .limit(1);
  return s ?? null;
}

/** Abrir turno: fondo inicial, comparado con lo que dejó el turno anterior. */
export async function openShift(tx: DbOrTx, ctx: OpContext, p: OpPayload<"cash.shift_open">) {
  need(ctx, "shift", "Abrir la caja");
  const [reg] = await tx.select().from(registers).where(eq(registers.id, p.registerId));
  if (!reg) throw new Rejection("La caja no existe");
  const [existing] = await tx.select().from(shifts).where(eq(shifts.id, p.shiftId));
  if (existing) throw new Rejection("Ese turno ya estaba abierto");

  const [prev] = await tx
    .select()
    .from(shifts)
    .where(and(eq(shifts.registerId, p.registerId), eq(shifts.status, "closed")))
    .orderBy(desc(shifts.closedAt))
    .limit(1);
  const other = await openShiftOf(tx, p.registerId);

  await tx.insert(shifts).values({
    id: p.shiftId,
    registerId: p.registerId,
    memberId: ctx.memberId,
    status: "open",
    openedAt: ctx.at,
    openingFloatCents: p.openingFloatCents,
    openingCounts: p.counts ?? null,
    previousLeftCents: prev?.leftFloatCents ?? null,
    openingNote: p.note ?? null,
    deviceId: ctx.deviceId,
  });
  if (other) {
    await raiseAlert(tx, {
      kind: "shift_mismatch",
      title: `${reg.name}: hay dos turnos abiertos`,
      body: "Se abrió un turno sin cerrar el anterior. Cerrá el que quedó abierto.",
      refType: "shift",
      refId: other.id,
      dedupeKey: `two_open:${p.registerId}`,
    });
  }
  return { shiftId: p.shiftId, previousLeftCents: prev?.leftFloatCents ?? null };
}

export type CashEntry = {
  id?: string;
  shiftId: string;
  kind: CashMovementKind;
  method?: PaymentMethod;
  amountCents: number;
  reason?: string | null;
  category?: string | null;
  note?: string | null;
  refType?: string | null;
  refId?: string | null;
  memberId?: string | null;
  authorizedBy?: string | null;
  deviceId?: string | null;
  at?: Date | null;
};

/** Agrega un movimiento al libro de caja (solo crece). */
export async function addCash(tx: DbOrTx, e: CashEntry): Promise<string> {
  const id = e.id ?? newId();
  await tx.insert(cashMovements).values({
    id,
    shiftId: e.shiftId,
    kind: e.kind,
    method: e.method ?? "cash",
    amountCents: e.amountCents,
    reason: e.reason ?? null,
    category: e.category ?? null,
    note: e.note ?? null,
    refType: e.refType ?? null,
    refId: e.refId ?? null,
    memberId: e.memberId ?? null,
    authorizedBy: e.authorizedBy ?? null,
    deviceId: e.deviceId ?? null,
    deviceAt: e.at ?? null,
    createdAt: e.at ?? new Date(),
  });
  return id;
}

/** Efectivo esperado: fondo inicial + todo lo que entró y salió en efectivo. */
export async function expectedCash(tx: DbOrTx, shiftId: string): Promise<number> {
  const s = await getShift(tx, shiftId);
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${cashMovements.amountCents}), 0)` })
    .from(cashMovements)
    .where(and(eq(cashMovements.shiftId, shiftId), eq(cashMovements.method, "cash")));
  return s.openingFloatCents + Number(row?.total ?? 0);
}

/** Retiro, gasto, ingreso o pago a proveedor en efectivo. Todos piden motivo. */
export async function cashMovement(tx: DbOrTx, ctx: OpContext, p: OpPayload<"cash.movement">) {
  need(ctx, "cash_movement", "Retiros y gastos de caja");
  const s = await getShift(tx, p.shiftId);
  if (s.status !== "open" && !ctx.offline) throw new Rejection("El turno ya está cerrado");
  const sign = p.kind === "income" ? 1 : -1;
  let refType: string | null = null;
  let refId: string | null = null;
  if (p.kind === "supplier_payment") {
    if (!p.invoiceId) throw new Rejection("Elegí la factura que pagás");
    const [inv] = await tx
      .select()
      .from(supplierInvoices)
      .where(eq(supplierInvoices.id, p.invoiceId))
      .for("update");
    if (!inv) throw new Rejection("La factura no existe");
    const paid = inv.paidCents + p.amountCents;
    await tx
      .update(supplierInvoices)
      .set({
        paidCents: paid,
        status: paid >= inv.amountCents ? "paid" : "partial",
        updatedAt: new Date(),
      })
      .where(eq(supplierInvoices.id, inv.id));
    refType = "supplier_payment";
    refId = newId();
    await tx.insert(supplierPayments).values({
      id: refId,
      supplierId: inv.supplierId,
      invoiceId: inv.id,
      amountCents: p.amountCents,
      method: "cash",
      cashMovementId: p.id,
      memberId: ctx.memberId,
      paidAt: ctx.at,
      note: p.note ?? null,
    });
  }
  await addCash(tx, {
    id: p.id,
    shiftId: p.shiftId,
    kind: p.kind,
    amountCents: sign * p.amountCents,
    reason: p.reason,
    category: p.category ?? null,
    note: p.note ?? null,
    refType,
    refId,
    memberId: ctx.memberId,
    authorizedBy: ctx.authorizedBy,
    deviceId: ctx.deviceId,
    at: ctx.at,
  });
  return { movementId: p.id };
}

/**
 * Cierre: el servidor recalcula el esperado con todo lo que tiene. Si no coincide con lo
 * que calculó el dispositivo, avisa. Por encima de la tolerancia, el comentario es obligatorio.
 */
export async function closeShift(tx: DbOrTx, ctx: OpContext, p: OpPayload<"cash.shift_close">) {
  need(ctx, "shift", "Cerrar la caja");
  const s = await getShift(tx, p.shiftId, true);
  if (s.status === "closed") throw new Rejection("El turno ya estaba cerrado");
  const [reg] = await tx.select().from(registers).where(eq(registers.id, s.registerId));
  const expected = await expectedCash(tx, s.id);
  const difference = p.countedCashCents - expected;
  const tolerance = reg?.toleranceCents ?? 50000;
  if (Math.abs(difference) > tolerance && !p.note?.trim() && !ctx.offline) {
    throw new Rejection("La diferencia supera la tolerancia: contá qué pasó");
  }
  const mismatch = expected - p.expectedCashCents;
  await tx
    .update(shifts)
    .set({
      status: "closed",
      closedAt: ctx.at,
      closedBy: ctx.memberId,
      expectedCashCents: expected,
      countedCashCents: p.countedCashCents,
      closingCounts: p.counts ?? null,
      otherMedia: p.otherMedia ?? null,
      differenceCents: difference,
      closeNote: p.note ?? null,
      leftFloatCents: p.leftFloatCents,
      withdrawnCents: p.withdrawnCents,
      serverMismatchCents: mismatch === 0 ? null : mismatch,
      updatedAt: new Date(),
    })
    .where(eq(shifts.id, s.id));

  const [cashier] = await tx
    .select({ name: members.name })
    .from(members)
    .where(eq(members.id, s.memberId));
  const moves = await tx.select().from(cashMovements).where(eq(cashMovements.shiftId, s.id));
  const notice = closeNotice({
    shiftLabel: shiftName(s.openedAt),
    cashier: cashier?.name ?? "",
    salesCents: summarizeShift(s.openingFloatCents, moves).salesCents,
    countedCents: p.countedCashCents,
    differenceCents: difference,
  });
  // El dueño se entera de cada cierre; con diferencia fuera de tolerancia, como alerta.
  const over = Math.abs(difference) > tolerance;
  await raiseAlert(tx, {
    kind: over ? "cash_difference" : "shift_closed",
    severity: over ? "danger" : "info",
    title: notice,
    body: p.note ?? null,
    refType: "shift",
    refId: s.id,
    dedupeKey: `shift_close:${s.id}`,
    data: { expected, counted: p.countedCashCents, difference, registerName: reg?.name ?? "Caja" },
  });
  if (mismatch !== 0) {
    await raiseAlert(tx, {
      kind: "shift_mismatch",
      title: `El cierre de ${cashier?.name ?? "un turno"} no coincide con el servidor`,
      body: `El dispositivo calculó ${formatMoney(p.expectedCashCents)} y el servidor ${formatMoney(expected)}: llegaron movimientos de otro dispositivo.`,
      refType: "shift",
      refId: s.id,
      dedupeKey: `shift_mismatch:${s.id}`,
      data: { device: p.expectedCashCents, server: expected },
    });
  }
  return { expectedCashCents: expected, differenceCents: difference, mismatchCents: mismatch };
}
