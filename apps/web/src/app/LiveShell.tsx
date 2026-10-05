import type { ReactNode } from "react";
import { useSyncStatus } from "../sync/status";
import { defaultShell, ShellProvider, type ShellState } from "./shell";

/** Arma el estado de las barras con lo que pasa en vivo (conexión y cola). */
export function LiveShell({ base, children }: { base?: Partial<ShellState>; children: ReactNode }) {
  const sync = useSyncStatus();
  const value: ShellState = {
    ...defaultShell,
    ...base,
    connection: { online: sync.online, pending: sync.pendingSales, justSynced: sync.justDrained },
  };
  return <ShellProvider value={value}>{children}</ShellProvider>;
}
