import { useSyncExternalStore } from "react";

export type LockReason = "switch" | "idle";

/** Pantalla de cambio rápido de usuario (PIN): abierta a pedido ("switch") o por inactividad ("idle"). */
let state: { open: boolean; reason: LockReason } = { open: false, reason: "switch" };
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export const lockScreen = {
  open(reason: LockReason = "switch") {
    state = { open: true, reason };
    emit();
  },
  close() {
    state = { ...state, open: false };
    emit();
  },
};

export function useLockScreen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state.open,
    () => state.open,
  );
}

/** Por qué está abierta: por inactividad no se puede volver sin PIN. */
export function useLockReason(): LockReason {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state.reason,
    () => state.reason,
  );
}
