import { useSyncExternalStore } from "react";

/** La sesión venció (la API respondió 401 con una sesión que antes andaba). */
let expired = false;
const listeners = new Set<() => void>();
export const sessionExpired = {
  set(v: boolean) {
    if (expired === v) return;
    expired = v;
    for (const l of listeners) l();
  },
  get: () => expired,
};
export function useSessionExpired(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => expired,
    () => expired,
  );
}
