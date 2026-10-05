import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  customType,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, ts } from "./common";

export type AlertKind =
  | "low_stock"
  | "expiry"
  | "cash_difference"
  | "order_confirmed"
  | "order_no_response"
  | "invoice_due"
  | "credit_overdue"
  | "sale_voided"
  | "negative_stock"
  | "adjustment_pending"
  | "sync_rejected"
  | "duplicate_barcode"
  | "credit_over_limit"
  | "shift_mismatch"
  | "clock_skew"
  | "shift_closed";

/** Avisos: campana en la app y push. */
export const alerts = pgTable(
  "alerts",
  {
    id: id(),
    kind: text().$type<AlertKind>().notNull(),
    severity: text().$type<"info" | "warning" | "danger">().notNull().default("warning"),
    title: text().notNull(),
    body: text(),
    refType: text(),
    refId: text(),
    /** Para no repetir el mismo aviso abierto (por ejemplo, stock bajo de un producto). */
    dedupeKey: text(),
    status: text().$type<"open" | "snoozed" | "resolved">().notNull().default("open"),
    snoozedUntil: ts("snoozed_until"),
    resolvedAt: ts("resolved_at"),
    resolvedBy: uuid(),
    data: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("alerts_dedupe_uq").on(t.dedupeKey),
    index("alerts_status_idx").on(t.status, t.createdAt),
  ],
);

export const alertReads = pgTable(
  "alert_reads",
  {
    alertId: uuid()
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    memberId: uuid().notNull(),
    readAt: createdAt(),
  },
  (t) => [uniqueIndex("alert_reads_pk").on(t.alertId, t.memberId)],
);

/** Auditoría: quién, desde qué dispositivo, cuándo, valor anterior y nuevo. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),
    before: jsonb(),
    after: jsonb(),
    memberId: uuid(),
    authorizedBy: uuid(),
    deviceId: uuid(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_created_idx").on(t.createdAt),
    index("audit_log_member_idx").on(t.memberId),
  ],
);

/** Operaciones recibidas por sincronización: el op_id es único (idempotencia). */
export const syncOps = pgTable(
  "sync_ops",
  {
    opId: uuid().primaryKey(),
    type: text().notNull(),
    deviceId: uuid(),
    memberId: uuid(),
    payload: jsonb().notNull(),
    status: text().$type<"applied" | "rejected">().notNull(),
    result: jsonb(),
    reason: text(),
    deviceAt: ts("device_at"),
    createdAt: createdAt(),
  },
  (t) => [index("sync_ops_device_idx").on(t.deviceId, t.createdAt)],
);

const xid8 = customType<{ data: string }>({ dataType: () => "xid8" });

/**
 * Registro de cambios para GET /api/sync/pull: lo llenan triggers de Postgres.
 * `xid` permite no entregar cambios de transacciones que todavía pueden confirmarse.
 */
export const changeLog = pgTable(
  "change_log",
  {
    seq: bigserial({ mode: "number" }).primaryKey(),
    entity: text().notNull(),
    entityId: text().notNull(),
    op: text().$type<"upsert" | "delete">().notNull(),
    xid: xid8().notNull().default(sql`pg_current_xact_id()`),
    createdAt: createdAt(),
  },
  (t) => [index("change_log_entity_idx").on(t.entity, t.entityId)],
);

/** Caché de Open Food Facts por código (también los que no encontró). */
export const offCache = pgTable("off_cache", {
  code: text().primaryKey(),
  found: boolean().notNull(),
  data: jsonb().$type<{
    name: string | null;
    brand: string | null;
    quantity: string | null;
    imageUrl: string | null;
  }>(),
  fetchedAt: createdAt(),
});
