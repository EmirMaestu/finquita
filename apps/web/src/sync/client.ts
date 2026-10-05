import { MAX_PUSH_BATCH, type OpResult, type SyncOp } from "@mostrador/shared";
import { type MostradorDB, PULL_TABLES, type PullTable } from "../data/db";
import type { Delta } from "../data/types";

export type PullChange =
  | { entity: string; id: string; op: "upsert"; data: Record<string, unknown> }
  | { entity: string; id: string; op: "delete" };

export type ServerResult = OpResult | { opId: string; status: "error"; reason: string };

/** Cómo habla con el servidor (en los tests se reemplaza). */
export type Transport = {
  push(body: { deviceNow: string; ops: SyncOp[] }): Promise<{ results: ServerResult[] }>;
  pull(
    since: string,
    limit: number,
  ): Promise<{ changes: PullChange[]; cursor: string; hasMore: boolean }>;
};

export type PushSummary = { sent: number; applied: number; rejected: number; stopped: boolean };

const CURSOR = "sync.cursor";
const isPullTable = (e: string): e is PullTable => (PULL_TABLES as readonly string[]).includes(e);

/**
 * Cola de operaciones del dispositivo. Cada operación se guarda con sus efectos
 * optimistas (stock, saldo, caja) en la misma transacción local; se manda en orden,
 * en lotes de hasta 100, y los efectos se descartan recién cuando el pull trae el
 * estado del servidor que ya los incluye.
 */
export class SyncClient {
  constructor(
    private db: MostradorDB,
    private transport: Transport,
    private now: () => Date = () => new Date(),
  ) {}

  /** Agrega una operación a la cola y aplica sus efectos en la copia local. */
  async enqueue(op: SyncOp, deltas: Omit<Delta, "opId" | "id">[] = []): Promise<void> {
    await this.db.transaction("rw", this.db.queue, this.db.deltas, async () => {
      await this.db.queue.add({
        opId: op.opId,
        type: op.type,
        op,
        attempts: 0,
        createdAt: this.now().toISOString(),
      });
      if (deltas.length) await this.db.deltas.bulkAdd(deltas.map((d) => ({ ...d, opId: op.opId })));
    });
  }

  async pending(type?: SyncOp["type"]): Promise<number> {
    return type ? this.db.queue.where("type").equals(type).count() : this.db.queue.count();
  }

  /** Manda la cola en orden. Para en el primer error (o sin conexión) para no alterar el orden. */
  async push(): Promise<PushSummary> {
    const summary: PushSummary = { sent: 0, applied: 0, rejected: 0, stopped: false };
    for (;;) {
      const batch = await this.db.queue.orderBy("seq").limit(MAX_PUSH_BATCH).toArray();
      if (!batch.length) return summary;
      let res: { results: ServerResult[] };
      try {
        res = await this.transport.push({
          deviceNow: this.now().toISOString(),
          ops: batch.map((b) => b.op),
        });
      } catch (err) {
        await this.db.queue.bulkPut(
          batch.map((b) => ({ ...b, attempts: b.attempts + 1, lastError: String(err) })),
        );
        throw err;
      }
      summary.sent += batch.length;
      const byId = new Map(res.results.map((r) => [r.opId, r]));
      let stopped = false;
      await this.db.transaction("rw", this.db.queue, this.db.rejected, this.db.deltas, async () => {
        for (const item of batch) {
          const r = byId.get(item.opId);
          if (!r || r.status === "error") {
            stopped = true;
            if (r)
              await this.db.queue.update(item.seq as number, {
                attempts: item.attempts + 1,
                lastError: r.reason,
              });
            break;
          }
          await this.db.queue.delete(item.seq as number);
          if (r.status === "applied") {
            summary.applied++;
          } else {
            // Rechazada: el servidor la guardó y la mandó a Avisos. Acá se deshace el efecto local.
            summary.rejected++;
            await this.db.rejected.put({
              opId: item.opId,
              type: item.type,
              op: item.op,
              reason: r.reason,
              at: this.now().toISOString(),
            });
            await this.db.deltas.where("opId").equals(item.opId).delete();
          }
        }
      });
      if (stopped) {
        summary.stopped = true;
        return summary;
      }
    }
  }

  /** Baja los cambios desde el último cursor y los guarda en la copia local. */
  async pull(limit = 1000): Promise<number> {
    let applied = 0;
    for (let page = 0; page < 1000; page++) {
      const since = (await this.db.getMeta<string>(CURSOR)) ?? "0";
      const res = await this.transport.pull(since, limit);
      await this.db.transaction(
        "rw",
        [...PULL_TABLES.map((t) => this.db[t]), this.db.meta],
        async () => {
          for (const ch of res.changes) {
            if (!isPullTable(ch.entity)) continue;
            // biome-ignore lint/suspicious/noExplicitAny: cada tabla tiene su tipo
            const table = this.db[ch.entity] as any;
            if (ch.op === "delete") await table.delete(ch.id);
            else await table.put(ch.data);
            applied++;
          }
          await this.db.setMeta(CURSOR, res.cursor);
        },
      );
      if (!res.hasMore) break;
    }
    // Lo que el servidor ya aplicó viene incluido en lo que bajó: los efectos locales sobran.
    const queued = new Set((await this.db.queue.toArray()).map((x) => x.opId));
    const stale = (await this.db.deltas.toArray())
      .filter((d) => !queued.has(d.opId))
      .map((d) => d.id as number);
    if (stale.length) await this.db.deltas.bulkDelete(stale);
    return applied;
  }

  /** Un ciclo completo: primero manda, después baja. */
  async sync(): Promise<{ push: PushSummary; pulled: number }> {
    const push = await this.push();
    const pulled = await this.pull();
    return { push, pulled };
  }

  /** Suma de efectos pendientes (por ejemplo, stock vendido sin confirmar). */
  async delta(kind: Delta["kind"], key: string): Promise<number> {
    const rows = await this.db.deltas.where("[kind+key]").equals([kind, key]).toArray();
    return rows.reduce((s, d) => s + d.amount, 0);
  }
}
