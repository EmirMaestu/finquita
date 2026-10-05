import { OfflineError } from "../data/api";
import { uploadPendingFiles } from "../data/files";
import type { SyncClient } from "./client";
import { bumpLocalVersion, getSyncStatus, setSyncStatus } from "./status";

export const SYNC_INTERVAL_MS = 20_000;

type Env = {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  addEventListener: (type: "online" | "offline", fn: () => void) => void;
  removeEventListener: (type: "online" | "offline", fn: () => void) => void;
};

const browserEnv = (): Env => ({
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id as number),
  addEventListener: (t, fn) => window.addEventListener(t, fn),
  removeEventListener: (t, fn) => window.removeEventListener(t, fn),
});

/**
 * Cuándo sincroniza: al abrir la app, cada 20 segundos, al volver internet, después de
 * cada venta (kick) y cuando el servidor avisa por SSE que hay cambios (kick).
 * Un solo ciclo a la vez; si piden otro mientras corre, se hace uno más al terminar.
 */
export class SyncEngine {
  private running: Promise<void> | null = null;
  private again = false;
  private timer: unknown = null;
  private stops: (() => void)[] = [];

  constructor(
    private client: SyncClient,
    private env: Env = browserEnv(),
  ) {}

  start(): void {
    void this.kick();
    this.timer = this.env.setInterval(() => void this.kick(), SYNC_INTERVAL_MS);
    const online = () => {
      setSyncStatus({ online: true });
      void this.kick();
    };
    const offline = () => setSyncStatus({ online: false });
    this.env.addEventListener("online", online);
    this.env.addEventListener("offline", offline);
    this.stops.push(
      () => this.env.removeEventListener("online", online),
      () => this.env.removeEventListener("offline", offline),
    );
  }

  stop(): void {
    if (this.timer !== null) this.env.clearInterval(this.timer);
    for (const s of this.stops) s();
    this.stops = [];
  }

  /** Espera a que no quede ningún ciclo corriendo. */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  /** Pide un ciclo de sincronización (después de una venta, por SSE, etc.). */
  kick(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.cycle().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.kick();
      }
    });
    return this.running;
  }

  private async cycle(): Promise<void> {
    setSyncStatus({ syncing: true });
    try {
      await this.client.sync();
      await uploadPendingFiles().catch(() => undefined);
      setSyncStatus({ online: true, lastSyncAt: new Date().toISOString() });
      bumpLocalVersion();
    } catch (err) {
      if (err instanceof OfflineError) setSyncStatus({ online: false });
    } finally {
      await this.refreshCounts();
      setSyncStatus({ syncing: false });
    }
  }

  async refreshCounts(): Promise<void> {
    const before = getSyncStatus().pendingSales;
    const pendingSales = await this.client.pending("sale.create");
    const drained = before > 0 && pendingSales === 0 && getSyncStatus().online;
    setSyncStatus({
      pendingSales,
      pendingOps: await this.client.pending(),
      ...(drained ? { justDrained: true } : {}),
    });
    // "Todo sincronizado" se muestra unos segundos al vaciarse la cola.
    if (drained) setTimeout(() => setSyncStatus({ justDrained: false }), 5000);
  }
}
