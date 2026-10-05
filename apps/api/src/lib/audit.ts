import { newId } from "@mostrador/shared";
import type { Context } from "hono";
import type { AppEnv } from "../app";
import type { Db } from "../db/client";
import { auditLog } from "../db/schema/index";

/** Algo que puede escribir: la base o una transacción abierta. */
export type Writer = Pick<Db, "insert">;

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  memberId?: string | null;
  authorizedBy?: string | null;
  deviceId?: string | null;
  note?: string | null;
  at?: Date;
};

/** Solo los campos que cambiaron, para que Actividad muestre "antes → después". */
export function diff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    if (k === "updatedAt" || k === "createdAt") continue;
    const x = before?.[k];
    const y = after?.[k];
    if (JSON.stringify(x) !== JSON.stringify(y)) {
      b[k] = x ?? null;
      a[k] = y ?? null;
    }
  }
  return { before: b, after: a };
}

/** Registra un cambio sensible: quién, desde qué dispositivo, cuándo, antes y después. */
export async function audit(w: Writer, e: AuditEntry): Promise<void> {
  await w.insert(auditLog).values({
    id: newId(),
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? null,
    before: e.before ?? null,
    after: e.after ?? null,
    memberId: e.memberId ?? null,
    authorizedBy: e.authorizedBy ?? null,
    deviceId: e.deviceId ?? null,
    note: e.note ?? null,
    createdAt: e.at ?? new Date(),
  });
}

/** Igual que audit(), con el actor y el dispositivo del pedido. */
export function auditFrom(
  c: Context<AppEnv>,
  w: Writer,
  e: Omit<AuditEntry, "memberId" | "deviceId">,
) {
  const actor = c.get("actor");
  let authorizedBy = e.authorizedBy ?? null;
  try {
    authorizedBy ??= c.get("authz")?.authorizedBy ?? null;
  } catch {}
  return audit(w, {
    ...e,
    authorizedBy,
    memberId: actor?.member.id ?? null,
    deviceId: actor?.device?.id ?? c.get("device")?.id ?? null,
  });
}
