import { useSyncExternalStore } from "react";

/** Si hay una venta en curso (con ítems o en el cobro). Nada la interrumpe. */
let inProgress = false;
const listeners = new Set<() => void>();

export function setSaleInProgress(value: boolean) {
  if (value === inProgress) return;
  inProgress = value;
  for (const l of listeners) l();
}

export function isSaleInProgress(): boolean {
  return inProgress;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSaleInProgress(): boolean {
  return useSyncExternalStore(subscribe, isSaleInProgress, isSaleInProgress);
}
