import { effectiveGrant, type Overrides, type Role, todayAR } from "@mostrador/shared";
import { inArray, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Db } from "../db/client";
import {
  barcodes,
  categories,
  customers,
  members,
  products,
  promotionProducts,
  promotions,
  registers,
  settings,
  shifts,
  suppliers,
} from "../db/schema/index";

export type PullChange =
  | { entity: string; id: string; op: "upsert"; data: Record<string, unknown> }
  | { entity: string; id: string; op: "delete" };

export type PullResponse = { changes: PullChange[]; cursor: string; hasMore: boolean };

type Row = Record<string, unknown>;
type Viewer = { role: Role; overrides: Overrides };

type EntityDef = {
  load: (db: Db, ids: string[]) => Promise<Row[]>;
  key?: string;
  /** Devuelve null si el registro cuenta como baja. */
  shape: (row: Row, viewer: Viewer) => Row | null;
};

type WithId = PgTable & { id: PgColumn };

const byIds = (table: WithId) => (db: Db, ids: string[]) =>
  db.select().from(table).where(inArray(table.id, ids)) as unknown as Promise<Row[]>;

const notDeleted = (row: Row) => (row.deletedAt ? null : row);
const COSTS = ["costCents", "avgCostCents", "marginBp"];

/** Lo que baja a cada dispositivo. Lo que el rol no puede ver, no viaja. */
const ENTITIES: Record<string, EntityDef> = {
  products: {
    load: byIds(products),
    shape: (row, v) => {
      if (row.deletedAt) return null;
      if (effectiveGrant(v.role, "view_costs", v.overrides) === "allow") return row;
      const { ...rest } = row;
      for (const k of COSTS) delete rest[k];
      return rest;
    },
  },
  barcodes: { load: byIds(barcodes), shape: (r) => r },
  categories: { load: byIds(categories), shape: notDeleted },
  customers: {
    // Con lo vencido calculado: el cobro con fiado lo necesita sin conexión.
    load: async (db, ids) => {
      const rows = (await db.select().from(customers).where(inArray(customers.id, ids))) as Row[];
      const credit = await creditByCustomer(db, ids);
      return rows.map((r) => ({
        ...r,
        ...(credit.get(String(r.id)) ?? { overdueCents: 0, oldestDebtAt: null }),
      }));
    },
    shape: notDeleted,
  },
  registers: { load: byIds(registers), shape: (r) => r },
  suppliers: {
    load: byIds(suppliers),
    shape: (r) =>
      r.deletedAt
        ? null
        : { id: r.id, name: r.name, whatsapp: r.whatsapp, channel: r.channel, active: r.active },
  },
  members: {
    load: byIds(members),
    shape: (r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      active: r.active,
      hasPin: Boolean(r.pinHash),
    }),
  },
  shifts: {
    load: byIds(shifts),
    shape: (r) => ({
      id: r.id,
      registerId: r.registerId,
      memberId: r.memberId,
      status: r.status,
      openedAt: r.openedAt,
      openingFloatCents: r.openingFloatCents,
      closedAt: r.closedAt,
      leftFloatCents: r.leftFloatCents,
    }),
  },
  settings: {
    key: "key",
    load: (db, ids) =>
      db.select().from(settings).where(inArray(settings.key, ids)) as Promise<Row[]>,
    shape: (r) => r,
  },
  promotions: {
    load: async (db, ids) => {
      const rows = (await db.select().from(promotions).where(inArray(promotions.id, ids))) as Row[];
      const items = await db
        .select()
        .from(promotionProducts)
        .where(inArray(promotionProducts.promotionId, ids));
      return rows.map((r) => ({
        ...r,
        products: items
          .filter((i) => i.promotionId === r.id)
          .map((i) => ({ productId: i.productId, qty: i.qty })),
      }));
    },
    shape: notDeleted,
  },
};

/**
 * Deuda vencida y fecha de la deuda más vieja de cada cliente, con las asignaciones de pagos
 * (lo que no está asignado a una compra, se aplica a las más viejas primero).
 */
export async function creditByCustomer(db: Db, ids: string[]) {
  const out = new Map<string, { overdueCents: number; oldestDebtAt: string | null }>();
  if (!ids.length) return out;
  const today = todayAR();
  const rows = await db.execute<{
    customer_id: string;
    id: string;
    amount: string;
    due_on: string | null;
    created_at: Date;
    allocated: string;
  }>(sql`
    select l.customer_id, l.id, l.amount_cents::text as amount, l.due_on::text, l.created_at,
      coalesce((select sum(a.amount_cents) from ledger_allocations a where a.charge_id = l.id), 0)::text as allocated
    from customer_ledger l
    where l.customer_id in ${sql.raw(
      `(${
        ids
          .filter((i) => /^[0-9a-f-]{36}$/i.test(i))
          .map((i) => `'${i}'`)
          .join(",") || "null"
      })`,
    )} and l.amount_cents > 0
    order by l.created_at, l.id`);
  for (const id of ids) out.set(id, { overdueCents: 0, oldestDebtAt: null });
  for (const r of rows) {
    const open = Number(r.amount) - Number(r.allocated);
    if (open <= 0) continue;
    const cur = out.get(r.customer_id) ?? { overdueCents: 0, oldestDebtAt: null };
    if (r.due_on && r.due_on < today) cur.overdueCents += open;
    cur.oldestDebtAt ??= new Date(r.created_at).toISOString();
    out.set(r.customer_id, cur);
  }
  return out;
}

/** Cursor "xid:seq": ya se entregó todo lo anterior a ese punto. */
function parseCursor(since: string | undefined): { xid: string; seq: number } {
  if (!since || since === "0") return { xid: "0", seq: 0 };
  const [xid, seq] = since.split(":");
  if (!xid || !/^\d+$/.test(xid) || !/^\d+$/.test(seq ?? "")) return { xid: "0", seq: 0 };
  return { xid, seq: Number(seq) };
}

/**
 * Cambios desde el cursor, con las bajas marcadas. Solo se entregan cambios de
 * transacciones que ya terminaron (xid menor al xmin del snapshot), en orden (xid, seq):
 * así una transacción que confirma tarde nunca queda detrás del cursor.
 */
export async function pullChanges(
  db: Db,
  viewer: Viewer,
  since: string | undefined,
  limit = 1000,
): Promise<PullResponse> {
  const c = parseCursor(since);
  const rows = await db.execute<{
    seq: string;
    xid: string;
    entity: string;
    entity_id: string;
    op: string;
    xmin: string;
  }>(sql`
    select seq::text, xid::text, entity, entity_id, op, pg_snapshot_xmin(pg_current_snapshot())::text as xmin
    from change_log
    where (xid, seq) > (${c.xid}::xid8, ${c.seq}::bigint)
      and xid < pg_snapshot_xmin(pg_current_snapshot())
    order by change_log.xid, change_log.seq
    limit ${limit + 1}`);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  let cursor: string;
  if (hasMore) {
    const last = page.at(-1);
    cursor = `${last?.xid}:${last?.seq}`;
  } else {
    // Todo lo que terminó antes del xmin ya se entregó: el próximo pull arranca de ahí.
    const [snap] = page.length
      ? [{ xmin: page[0]?.xmin }]
      : await db.execute<{ xmin: string }>(
          sql`select pg_snapshot_xmin(pg_current_snapshot())::text as xmin`,
        );
    const xmin = snap?.xmin ?? c.xid;
    cursor =
      BigInt(xmin) > BigInt(c.xid) ? `${xmin}:0` : since && since !== "0" ? since : `${xmin}:0`;
  }

  // Un cambio por registro: el estado actual manda.
  const latest = new Map<string, { entity: string; id: string }>();
  for (const r of page)
    latest.set(`${r.entity}:${r.entity_id}`, { entity: r.entity, id: r.entity_id });
  const byEntity = new Map<string, string[]>();
  for (const { entity, id } of latest.values()) {
    if (!ENTITIES[entity]) continue;
    byEntity.set(entity, [...(byEntity.get(entity) ?? []), id]);
  }

  const changes: PullChange[] = [];
  for (const [entity, ids] of byEntity) {
    const def = ENTITIES[entity];
    if (!def) continue;
    const found = await def.load(db, ids);
    const key = def.key ?? "id";
    const map = new Map(found.map((r) => [String(r[key]), r]));
    for (const id of ids) {
      const row = map.get(id);
      const data = row ? def.shape(row, viewer) : null;
      changes.push(data ? { entity, id, op: "upsert", data } : { entity, id, op: "delete" });
    }
  }
  return { changes, cursor, hasMore };
}
