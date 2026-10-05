import "fake-indexeddb/auto";
import { newId, type SyncOp } from "@mostrador/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfflineError } from "../src/data/api";
import { MostradorDB } from "../src/data/db";
import { type PullChange, type ServerResult, SyncClient, type Transport } from "../src/sync/client";
import { SyncEngine } from "../src/sync/engine";
import { getSyncStatus, setSyncStatus, syncLabel } from "../src/sync/status";

const YERBA = newId();

function saleOp(): SyncOp {
  return {
    opId: newId(),
    type: "shortage.note",
    memberId: newId(),
    deviceAt: new Date().toISOString(),
    payload: { id: newId(), productId: YERBA },
  };
}

function sale(): SyncOp {
  return { ...saleOp(), type: "sale.create" } as unknown as SyncOp;
}

type FakeServer = {
  received: SyncOp[][];
  offline: boolean;
  reject: Set<string>;
  errorOn: Set<string>;
  changes: PullChange[];
  transport: Transport & {
    push: ReturnType<typeof vi.fn<Transport["push"]>>;
    pull: ReturnType<typeof vi.fn<Transport["pull"]>>;
  };
};

/** Servidor de mentira: aplica todo salvo lo que se le diga, y guarda lo que recibe. */
function fakeServer(): FakeServer {
  const received: SyncOp[][] = [];
  const applied = new Set<string>();
  const server: FakeServer = {
    received,
    offline: false,
    reject: new Set<string>(),
    errorOn: new Set<string>(),
    changes: [],
    transport: {
      push: vi.fn<Transport["push"]>(async (body) => {
        if (server.offline) throw new OfflineError();
        received.push(body.ops);
        const results: ServerResult[] = [];
        for (const op of body.ops) {
          if (server.errorOn.has(op.opId)) {
            results.push({ opId: op.opId, status: "error", reason: "falla" });
            break;
          }
          if (server.reject.has(op.opId))
            results.push({ opId: op.opId, status: "rejected", reason: "no tiene permiso" });
          else results.push({ opId: op.opId, status: "applied", duplicate: applied.has(op.opId) });
          applied.add(op.opId);
        }
        return { results };
      }),
      pull: vi.fn<Transport["pull"]>(async (since) => {
        if (server.offline) throw new OfflineError();
        const from = Number(since);
        const changes = server.changes.slice(from);
        return { changes, cursor: String(server.changes.length), hasMore: false };
      }),
    },
  };
  return server;
}

let db: MostradorDB;
beforeEach(async () => {
  db = new MostradorDB(`test-${newId()}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

describe("cola de sincronización", () => {
  it("guarda las operaciones en orden y las manda en ese orden", async () => {
    const server = fakeServer();
    const client = new SyncClient(db, server.transport);
    const ops = [sale(), saleOp(), sale()];
    for (const op of ops) await client.enqueue(op);
    expect(await client.pending()).toBe(3);
    expect(await client.pending("sale.create")).toBe(2);
    const r = await client.push();
    expect(r).toMatchObject({ sent: 3, applied: 3, rejected: 0, stopped: false });
    expect(server.received[0]?.map((o) => o.opId)).toEqual(ops.map((o) => o.opId));
    expect(await client.pending()).toBe(0);
  });

  it("manda en lotes de hasta 100", async () => {
    const server = fakeServer();
    const client = new SyncClient(db, server.transport);
    for (let i = 0; i < 250; i++) await client.enqueue(saleOp());
    await client.push();
    expect(server.received.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(await client.pending()).toBe(0);
  });

  it("sin conexión no pierde nada y reintenta después", async () => {
    const server = fakeServer();
    const client = new SyncClient(db, server.transport);
    const op = sale();
    await client.enqueue(op);
    server.offline = true;
    await expect(client.push()).rejects.toBeInstanceOf(OfflineError);
    expect(await client.pending("sale.create")).toBe(1);
    const [queued] = await db.queue.toArray();
    expect(queued?.attempts).toBe(1);
    server.offline = false;
    expect((await client.push()).applied).toBe(1);
    expect(await client.pending()).toBe(0);
  });

  it("reenviar lo ya aplicado no duplica (el servidor responde duplicada)", async () => {
    const server = fakeServer();
    const client = new SyncClient(db, server.transport);
    const op = sale();
    await client.enqueue(op);
    await client.push();
    // La respuesta se perdió: el dispositivo la vuelve a encolar con el mismo op_id.
    await client.enqueue(op);
    const r = await client.push();
    expect(r.applied).toBe(1);
    expect(await client.pending()).toBe(0);
  });

  it("lo rechazado sale de la cola, se guarda para mostrarlo y deshace su efecto local", async () => {
    const server = fakeServer();
    const client = new SyncClient(db, server.transport);
    const bad = sale();
    const good = sale();
    server.reject.add(bad.opId);
    await client.enqueue(bad, [{ kind: "stock", key: YERBA, amount: -1 }]);
    await client.enqueue(good, [{ kind: "stock", key: YERBA, amount: -2 }]);
    expect(await client.delta("stock", YERBA)).toBe(-3);
    const r = await client.push();
    expect(r).toMatchObject({ applied: 1, rejected: 1 });
    const rejected = await db.rejected.toArray();
    expect(rejected).toMatchObject([{ opId: bad.opId, reason: "no tiene permiso" }]);
    expect(await client.delta("stock", YERBA)).toBe(-2);
  });

  it("un error del servidor corta el lote ahí y conserva el orden", async () => {
    const server = fakeServer();
    const client = new SyncClient(db, server.transport);
    const [a, b, c] = [sale(), sale(), sale()];
    server.errorOn.add(b.opId);
    for (const op of [a, b, c]) await client.enqueue(op);
    const r = await client.push();
    expect(r).toMatchObject({ applied: 1, stopped: true });
    expect((await db.queue.orderBy("seq").toArray()).map((q) => q.opId)).toEqual([b.opId, c.opId]);
    server.errorOn.clear();
    await client.push();
    expect(await client.pending()).toBe(0);
  });

  it("los efectos optimistas quedan hasta que el pull trae el estado del servidor", async () => {
    const server = fakeServer();
    const client = new SyncClient(db, server.transport);
    server.changes.push({
      entity: "products",
      id: YERBA,
      op: "upsert",
      data: { id: YERBA, name: "Yerba", stockQty: 3 },
    });
    await client.pull();
    await client.enqueue(sale(), [{ kind: "stock", key: YERBA, amount: -1 }]);
    await client.push();
    // Confirmada, pero la copia local todavía dice 3: el efecto sigue contando.
    expect(await client.delta("stock", YERBA)).toBe(-1);
    server.changes.push({
      entity: "products",
      id: YERBA,
      op: "upsert",
      data: { id: YERBA, name: "Yerba", stockQty: 2 },
    });
    await client.pull();
    expect((await db.products.get(YERBA))?.stockQty).toBe(2);
    expect(await client.delta("stock", YERBA)).toBe(0);
  });

  it("el pull aplica altas y bajas y guarda el cursor", async () => {
    const server = fakeServer();
    const client = new SyncClient(db, server.transport);
    const code = newId();
    server.changes.push(
      {
        entity: "products",
        id: YERBA,
        op: "upsert",
        data: { id: YERBA, name: "Yerba", stockQty: 3 },
      },
      {
        entity: "barcodes",
        id: code,
        op: "upsert",
        data: { id: code, productId: YERBA, code: "7791234000012" },
      },
      {
        entity: "settings",
        id: "features",
        op: "upsert",
        data: { key: "features", value: { promotions: false } },
      },
    );
    expect(await client.pull()).toBe(3);
    expect(await db.getMeta("sync.cursor")).toBe("3");
    server.changes.push({ entity: "barcodes", id: code, op: "delete" });
    expect(await client.pull()).toBe(1);
    expect(await db.barcodes.count()).toBe(0);
    expect(server.transport.pull).toHaveBeenLastCalledWith("3", 1000);
  });
});

describe("motor de sincronización", () => {
  function fakeEnv() {
    const listeners: Record<string, (() => void)[]> = {};
    let tick: (() => void) | null = null;
    return {
      env: {
        setInterval: (fn: () => void) => {
          tick = fn;
          return 1;
        },
        clearInterval: () => {
          tick = null;
        },
        addEventListener: (t: string, fn: () => void) => {
          listeners[t] = [...(listeners[t] ?? []), fn];
        },
        removeEventListener: () => {},
      },
      fire: (t: string) => {
        for (const l of listeners[t] ?? []) l();
      },
      tick: () => tick?.(),
    };
  }

  it("sincroniza al arrancar, cada 20 s, al volver internet y cuando se lo pide", async () => {
    const server = fakeServer();
    const client = new SyncClient(db, server.transport);
    const fake = fakeEnv();
    const engine = new SyncEngine(client, fake.env);
    engine.start();
    await engine.kick();
    const calls = () => server.transport.pull.mock.calls.length;
    const first = calls();
    expect(first).toBeGreaterThanOrEqual(1);
    fake.tick();
    await engine.kick();
    fake.fire("online");
    await engine.kick();
    expect(calls()).toBeGreaterThan(first + 1);
    engine.stop();
    await engine.idle();
  });

  it("cuenta las ventas por sincronizar para el chip", async () => {
    const server = fakeServer();
    server.offline = true;
    const client = new SyncClient(db, server.transport);
    const engine = new SyncEngine(client, fakeEnv().env);
    for (let i = 0; i < 3; i++) await client.enqueue(sale());
    await engine.kick();
    expect(getSyncStatus()).toMatchObject({ online: false, pendingSales: 3 });
    expect(syncLabel(getSyncStatus())).toBe("Sin conexión · 3 ventas por sincronizar");
    server.offline = false;
    await engine.kick();
    expect(getSyncStatus()).toMatchObject({ online: true, pendingSales: 0, justDrained: true });
    expect(syncLabel(getSyncStatus())).toBe("Todo sincronizado");
    setSyncStatus({ justDrained: false });
    await engine.idle();
  });

  it("un solo ciclo a la vez", async () => {
    const server = fakeServer();
    const client = new SyncClient(db, server.transport);
    const engine = new SyncEngine(client, fakeEnv().env);
    await Promise.all([engine.kick(), engine.kick(), engine.kick()]);
    // El primero corre y los pedidos que llegaron mientras tanto se juntan en uno más.
    await engine.idle();
    expect(server.transport.pull.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
