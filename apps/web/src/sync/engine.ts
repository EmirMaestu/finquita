import { OfflineError } from "../data/api";
import { uploadPendingFiles } from "../data/files";
import { toast } from "../ui/toast";
import type { SyncClient } from "./client";
import { bumpLocalVersion, getSyncStatus, setSyncStatus } from "./status";

export const SYNC_INTERVAL_MS = 20_000;

type Env = {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  addEventListener: (type: "online" | "offline", fn: () => void) => void;
  removeEventListener: (type: "online" | "offline", fn: () => void) => void;
  /** Lo que dice el navegador (sin internet, una respuesta del service worker no cuenta). */
  isOnline?: () => boolean;
  /** Aviso a la persona (en el navegador, un toast). */
  notify?: (text: string) => void;
};

const browserEnv = (): Env => ({
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id as number),
  addEventListener: (t, fn) => window.addEventListener(t, fn),
  removeEventListener: (t, fn) => window.removeEventListener(t, fn),
  isOnline: () => navigator.onLine,
  notify: (text) => toast({ text, tone: "ok", ms: 5000 }),
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
  /** Lo que quedó guardado sin internet (para avisar cuando se suba). */
  private heldOffline: { sales: number; ops: number } | null = null;

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
      setSyncStatus({
        online: this.env.isOnline?.() ?? true,
        lastSyncAt: new Date().toISOString(),
      });
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
    const pendingOps = await this.client.pending();
    const online = getSyncStatus().online;
    const drained = before > 0 && pendingSales === 0 && online;
    setSyncStatus({
      pendingSales,
      pendingOps,
      ...(drained ? { justDrained: true } : {}),
    });
    // Al volver internet se dice que lo guardado en el dispositivo ya se subió (ronda 3).
    if (!online && pendingOps > 0)
      this.heldOffline = {
        sales: Math.max(this.heldOffline?.sales ?? 0, pendingSales),
        ops: Math.max(this.heldOffline?.ops ?? 0, pendingOps),
      };
    else if (online && pendingOps === 0 && this.heldOffline) {
      const { sales } = this.heldOffline;
      this.heldOffline = null;
      this.env.notify?.(
        sales === 1
          ? "Volvió internet: se subió la venta guardada en el dispositivo."
          : sales > 1
            ? `Volvió internet: se subieron las ${sales} ventas guardadas en el dispositivo.`
            : "Volvió internet: se subió lo guardado en el dispositivo.",
      );
    }
    // "Todo sincronizado" se muestra unos segundos al vaciarse la cola.
    if (drained) setTimeout(() => setSyncStatus({ justDrained: false }), 5000);
  }
}
