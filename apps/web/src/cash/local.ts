import { newId, type ShiftSummary, summarizeShift } from "@mostrador/shared";
import { api, OfflineError } from "../data/api";
import { localDb } from "../data/db";
import type { LocalCashMove, LocalShift } from "../data/types";
import { syncClient, syncEngine } from "../sync";
import { bumpLocalVersion } from "../sync/status";

/** La caja de este dispositivo (Caja 1 si no tiene una asignada). */
export async function deviceRegisterId(preferred?: string | null): Promise<string | null> {
  const db = localDb();
  if (preferred && (await db.registers.get(preferred))) return preferred;
  const regs = await db.registers.toArray();
  regs.sort((a, b) => Number(a.number) - Number(b.number));
  return (regs[0]?.id as string | undefined) ?? preferred ?? null;
}

export async function openShiftOf(registerId: string): Promise<LocalShift | null> {
  const list = await localDb().shifts.where("registerId").equals(registerId).toArray();
  return (
    list.filter((s) => s.status === "open").sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1))[0] ??
    null
  );
}

export async function lastClosedOf(registerId: string): Promise<LocalShift | null> {
  const list = await localDb().shifts.where("registerId").equals(registerId).toArray();
  return (
    list
      .filter((s) => s.status === "closed")
      .sort((a, b) => ((a.closedAt ?? "") < (b.closedAt ?? "") ? 1 : -1))[0] ?? null
  );
}

/** Abrir turno: queda abierto en el dispositivo al instante y viaja por la cola. */
export async function openShiftLocal(a: {
  memberId: string;
  registerId: string;
  openingFloatCents: number;
  counts?: Record<string, number> | null;
  note?: string | null;
}): Promise<string> {
  const shiftId = newId();
  const at = new Date().toISOString();
  await localDb().shifts.put({
    id: shiftId,
    registerId: a.registerId,
    memberId: a.memberId,
    status: "open",
    openedAt: at,
    openingFloatCents: a.openingFloatCents,
    closedAt: null,
    leftFloatCents: null,
  });
  await syncClient().enqueue({
    opId: newId(),
    type: "cash.shift_open",
    memberId: a.memberId,
    deviceAt: at,
    payload: {
      shiftId,
      registerId: a.registerId,
      openingFloatCents: a.openingFloatCents,
      counts: a.counts ?? null,
      note: a.note ?? null,
    },
  });
  bumpLocalVersion();
  void syncEngine().kick();
  return shiftId;
}

export type ManualMove = {
  shiftId: string;
  kind: "withdrawal" | "expense" | "income" | "supplier_payment";
  amountCents: number;
  reason: string;
  category?: "cleaning" | "freight" | "maintenance" | "salary_advance" | "other" | null;
  note?: string | null;
  invoiceId?: string | null;
};

/** Retiro, gasto, ingreso o pago a proveedor (con quién autorizó, si hizo falta PIN). */
export async function addCashMoveLocal(
  memberId: string,
  m: ManualMove,
  auth?: { memberId: string; name: string } | null,
) {
  const id = newId();
  const opId = newId();
  const at = new Date().toISOString();
  const sign = m.kind === "income" ? 1 : -1;
  await localDb().cashMoves.put({
    id,
    shiftId: m.shiftId,
    kind: m.kind,
    method: "cash",
    amountCents: sign * m.amountCents,
    reason: m.reason,
    category: m.category ?? null,
    memberId,
    authorizedByName: auth?.name ?? null,
    at,
    opId,
    source: "local",
  });
  await syncClient().enqueue({
    opId,
    type: "cash.movement",
    memberId,
    authorizedBy: auth?.memberId ?? null,
    deviceAt: at,
    payload: {
      id,
      shiftId: m.shiftId,
      kind: m.kind,
      amountCents: m.amountCents,
      reason: m.reason,
      category: m.category ?? null,
      note: m.note ?? null,
      invoiceId: m.invoiceId ?? null,
    },
  });
  bumpLocalVersion();
  void syncEngine().kick();
}

type ServerShift = {
  shift: {
    id: string;
    openingFloatCents: number;
    memberName: string;
    registerName: string;
    toleranceCents: number;
    status: string;
    openedAt: string;
  };
  movements: (Omit<LocalCashMove, "at" | "source" | "shiftId"> & {
    createdAt: string;
    shiftId: string;
  })[];
};

export type ShiftView = {
  summary: ShiftSummary;
  moves: LocalCashMove[];
  offline: boolean;
  registerName: string;
  memberName: string;
  toleranceCents: number;
};

/**
 * El turno como lo ve el dispositivo: lo que dice el servidor más lo propio que todavía
 * está en la cola. Sin conexión, la última copia del servidor más lo local.
 */
export async function loadShiftView(shift: LocalShift): Promise<ShiftView> {
  const db = localDb();
  let offline = false;
  let meta = { registerName: "Caja", memberName: "", toleranceCents: 50000 };
  try {
    const r = await api<ServerShift>(`/api/shifts/${shift.id}`);
    meta = {
      registerName: r.shift.registerName,
      memberName: r.shift.memberName,
      toleranceCents: r.shift.toleranceCents,
    };
    await db.transaction("rw", db.cashMoves, db.meta, async () => {
      await db.cashMoves
        .where("shiftId")
        .equals(shift.id)
        .filter((m) => m.source === "server")
        .delete();
      await db.cashMoves.bulkPut(
        r.movements.map((m) => ({ ...m, at: m.createdAt, source: "server" as const, opId: null })),
      );
      await db.setMeta(`shift.meta:${shift.id}`, meta);
    });
  } catch (err) {
    if (!(err instanceof OfflineError)) throw err;
    offline = true;
    meta = (await db.getMeta<typeof meta>(`shift.meta:${shift.id}`)) ?? meta;
  }
  const queued = new Set((await db.queue.toArray()).map((q) => q.opId));
  const all = await db.cashMoves.where("shiftId").equals(shift.id).toArray();
  const serverIds = new Set(all.filter((m) => m.source === "server").map((m) => m.id));
  // Lo local que ya llegó al servidor se ve una sola vez.
  const moves = all
    .filter((m) => m.source === "server" || (m.opId && queued.has(m.opId) && !serverIds.has(m.id)))
    .sort((a, b) => (a.at < b.at ? -1 : 1));
  return { summary: summarizeShift(shift.openingFloatCents, moves), moves, offline, ...meta };
}
