import { useSyncExternalStore } from "react";

/** true cuando la pantalla es de compu (≥ 1024 px, el `lg` de Tailwind). */
export function useWide(query = "(min-width: 1024px)"): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia?.(query);
      m?.addEventListener("change", cb);
      return () => m?.removeEventListener("change", cb);
    },
    () => window.matchMedia?.(query).matches ?? true,
    () => true,
  );
}
