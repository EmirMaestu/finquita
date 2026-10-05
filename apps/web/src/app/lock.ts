import { useSyncExternalStore } from "react";

/** Pantalla de cambio rápido de usuario (PIN) abierta o cerrada. */
let open = false;
const listeners = new Set<() => void>();

export const lockScreen = {
  open() {
    open = true;
    for (const l of listeners) l();
  },
  close() {
    open = false;
    for (const l of listeners) l();
  },
};

export function useLockScreen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => open,
    () => open,
  );
}
