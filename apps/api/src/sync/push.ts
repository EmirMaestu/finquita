import { isClockSkewed, type OpResult, type PushResponse, parseOp } from "@mostrador/shared";
import { eq } from "drizzle-orm";
import type { Actor } from "../auth/actor";
import type { Db } from "../db/client";
import { syncOps } from "../db/schema/index";
import { raiseAlert } from "../domain/alerts";
import { applyOp, OP_LABEL } from "../domain/apply";
import { ContextBuilder } from "../domain/context";
import { Rejection } from "../domain/types";
import { log } from "../lib/log";

export type PushResult = PushResponse & {
  results: (OpResult | { opId: string; status: "error"; reason: string })[];
};

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return (e.cause?.code ?? e.code) === "23505";
}

async function stored(db: Db, opId: string): Promise<OpResult | null> {
  const [row] = await db.select().from(syncOps).where(eq(syncOps.opId, opId));
  if (!row) return null;
  return row.status === "applied"
    ? {
        opId,
        status: "applied",
        duplicate: true,
        result: (row.result ?? undefined) as Record<string, unknown> | undefined,
      }
    : { opId, status: "rejected", duplicate: true, reason: row.reason ?? "" };
}

async function reject(
  db: Db,
  a: {
    opId: string;
    type: string;
    memberId: string | null;
    deviceId: string | null;
    payload: unknown;
    reason: string;
    deviceAt: Date | null;
  },
) {
  try {
    await db.transaction(async (tx) => {
      await tx.insert(syncOps).values({
        opId: a.opId,
        type: a.type,
        deviceId: a.deviceId,
        memberId: a.memberId,
        payload: a.payload ?? {},
        status: "rejected",
        reason: a.reason,
        deviceAt: a.deviceAt,
      });
      const label = OP_LABEL[a.type as keyof typeof OP_LABEL] ?? "operación";
      await raiseAlert(tx, {
        kind: "sync_rejected",
        severity: "danger",
        title: `No se pudo registrar una ${label}`,
        body: `${a.reason}. Quedó guardada para revisarla.`,
        refType: "sync_op",
        refId: a.opId,
        data: { type: a.type, memberId: a.memberId },
      });
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
}

/**
 * Aplica la cola de un dispositivo en orden, cada operación en su transacción.
 * El op_id es único: si llega dos veces, devuelve el resultado anterior sin duplicar.
 * Un error inesperado corta el lote ahí (status "error"): el dispositivo reintenta desde esa.
 */
export async function pushOps(
  db: Db,
  a: { actor: Actor; deviceNow: Date; ops: unknown[]; serverNow?: Date },
): Promise<PushResult> {
  const serverNow = a.serverNow ?? new Date();
  const clockSkew = isClockSkewed(a.deviceNow, serverNow);
  const deviceId = a.actor.device?.id ?? null;
  const contexts = new ContextBuilder(db);
  const results: PushResult["results"] = [];

  for (const raw of a.ops) {
    const parsed = parseOp(raw);
    if (!parsed.ok) {
      if (!parsed.opId) {
        results.push({ opId: "", status: "rejected", reason: parsed.reason });
        continue;
      }
      const prev = await stored(db, parsed.opId);
      if (prev) {
        results.push(prev);
        continue;
      }
      const r = raw as { type?: unknown; memberId?: unknown; payload?: unknown };
      await reject(db, {
        opId: parsed.opId,
        type: typeof r.type === "string" ? r.type : "desconocida",
        memberId: null,
        deviceId,
        payload: r.payload ?? raw,
        reason: parsed.reason,
        deviceAt: null,
      });
      results.push({ opId: parsed.opId, status: "rejected", reason: parsed.reason });
      continue;
    }

    const op = parsed.op;
    const prev = await stored(db, op.opId);
    if (prev) {
      results.push(prev);
      continue;
    }
    const at = new Date(op.deviceAt);
    try {
      if (!a.actor.device && op.memberId !== a.actor.member.id) {
        throw new Rejection(
          "Sin un dispositivo habilitado, solo podés mandar tus propias operaciones",
        );
      }
      const ctx = await contexts.build({
        memberId: op.memberId,
        authorizedBy: op.authorizedBy ?? null,
        deviceId,
        at,
        clockSkew,
        offline: true,
      });
      const result = await db.transaction(async (tx) => {
        const res = (await applyOp(tx, ctx, op)) ?? {};
        await tx.insert(syncOps).values({
          opId: op.opId,
          type: op.type,
          deviceId,
          memberId: op.memberId,
          payload: op.payload,
          status: "applied",
          result: res,
          deviceAt: at,
        });
        return res as Record<string, unknown>;
      });
      results.push({ opId: op.opId, status: "applied", result });
    } catch (err) {
      if (err instanceof Rejection) {
        await reject(db, {
          opId: op.opId,
          type: op.type,
          memberId: op.memberId,
          deviceId,
          payload: op.payload,
          reason: err.message,
          deviceAt: at,
        });
        results.push(
          (await stored(db, op.opId)) ?? { opId: op.opId, status: "rejected", reason: err.message },
        );
        continue;
      }
      if (isUniqueViolation(err)) {
        const again = await stored(db, op.opId);
        if (again) {
          results.push(again);
          continue;
        }
      }
      log.error("sync: error aplicando operación", {
        opId: op.opId,
        type: op.type,
        error: err instanceof Error ? err.message : String(err),
      });
      results.push({
        opId: op.opId,
        status: "error",
        reason: "No se pudo procesar ahora. Se reintenta solo.",
      });
      break;
    }
  }
  return { results, serverNow: serverNow.toISOString() };
}
