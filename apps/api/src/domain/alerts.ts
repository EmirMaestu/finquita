import { newId } from "@mostrador/shared";
import { sql } from "drizzle-orm";
import type { AlertKind } from "../db/schema/index";
import { alerts } from "../db/schema/index";
import type { DbOrTx } from "./types";

export type NewAlert = {
  kind: AlertKind;
  title: string;
  body?: string | null;
  severity?: "info" | "warning" | "danger";
  refType?: string | null;
  refId?: string | null;
  /** Un aviso abierto por clave: si ya existe, se actualiza (y se reabre). */
  dedupeKey?: string | null;
  data?: Record<string, unknown> | null;
  /**
   * Si ya existe con esa clave: false (chequeos programados) solo actualiza el texto de uno
   * abierto, sin reabrir lo pospuesto ni lo que alguien dio por resuelto.
   */
  reopen?: boolean;
};

/** Crea un aviso (campana y push). Con dedupeKey no se repite: se reabre y actualiza. */
export async function raiseAlert(db: DbOrTx, a: NewAlert): Promise<string> {
  const values = {
    id: newId(),
    kind: a.kind,
    title: a.title,
    body: a.body ?? null,
    severity: a.severity ?? "warning",
    refType: a.refType ?? null,
    refId: a.refId ?? null,
    dedupeKey: a.dedupeKey ?? null,
    data: a.data ?? null,
  };
  if (!a.dedupeKey) {
    await db.insert(alerts).values(values);
    return values.id;
  }
  if (a.reopen === false) {
    const [row] = await db
      .insert(alerts)
      .values(values)
      .onConflictDoUpdate({
        target: alerts.dedupeKey,
        set: {
          title: values.title,
          body: values.body,
          severity: values.severity,
          data: values.data,
        },
        setWhere: sql`${alerts.status} = 'open'`,
      })
      .returning({ id: alerts.id });
    return row?.id ?? values.id;
  }
  const [row] = await db
    .insert(alerts)
    .values(values)
    .onConflictDoUpdate({
      target: alerts.dedupeKey,
      set: {
        title: values.title,
        body: values.body,
        severity: values.severity,
        data: values.data,
        status: "open",
        snoozedUntil: null,
        resolvedAt: null,
        resolvedBy: null,
        createdAt: sql`now()`,
      },
    })
    .returning({ id: alerts.id });
  return row?.id ?? values.id;
}
