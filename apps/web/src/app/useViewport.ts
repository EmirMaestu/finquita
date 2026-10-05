import { useSyncExternalStore } from "react";

/** Breakpoints del sistema de diseño. */
export type Layout = "phone" | "tablet" | "desktop" | "wide";

export function layoutFor(width: number): Layout {
  if (width < 600) return "phone";
  if (width < 1024) return "tablet";
  if (width < 1440) return "desktop";
  return "wide";
}

function subscribe(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

export function useViewport(): { width: number; layout: Layout } {
  const width = useSyncExternalStore(
    subscribe,
    () => window.innerWidth,
    () => 1280,
  );
  return { width, layout: layoutFor(width) };
}
