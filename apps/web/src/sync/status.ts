import { useSyncExternalStore } from "react";

export type SyncStatus = {
  online: boolean;
  /** Ventas en la cola, sin confirmar por el servidor. */
  pendingSales: number;
  /** Todas las operaciones en la cola. */
  pendingOps: number;
  syncing: boolean;
  lastSyncAt: string | null;
  /** Operaciones rechazadas que todavía no se vieron. */
  rejected: number;
  /** Se acaba de vaciar la cola: "Todo sincronizado". */
  justDrained: boolean;
  /** Sube cada vez que cambia algo local o termina una sincronización (para refrescar vistas). */
  version: number;
};

let state: SyncStatus = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  pendingSales: 0,
  pendingOps: 0,
  syncing: false,
  lastSyncAt: null,
  rejected: 0,
  justDrained: false,
  version: 0,
};
const listeners = new Set<() => void>();

export function getSyncStatus(): SyncStatus {
  return state;
}

export function setSyncStatus(patch: Partial<SyncStatus>) {
  const next = { ...state, ...patch };
  if (Object.keys(patch).every((k) => next[k as keyof SyncStatus] === state[k as keyof SyncStatus]))
    return;
  state = next;
  for (const l of listeners) l();
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSyncStatus,
    getSyncStatus,
  );
}

/** Texto del chip: "Sin conexión · 3 ventas por sincronizar" o "Todo sincronizado". */
export function syncLabel(s: Pick<SyncStatus, "online" | "pendingSales">): string {
  const ventas = s.pendingSales === 1 ? "1 venta" : `${s.pendingSales} ventas`;
  if (!s.online)
    return s.pendingSales ? `Sin conexión · ${ventas} por sincronizar` : "Sin conexión";
  if (s.pendingSales) return `Sincronizando · ${ventas}`;
  return "Todo sincronizado";
}

/** Avisa a las vistas que cambió algo en la copia local. */
export function bumpLocalVersion() {
  setSyncStatus({ version: state.version + 1 });
}
