import { formatTime } from "@mostrador/shared";
import type { ReactNode } from "react";
import { useRegister } from "../cash/useRegister";
import { useSyncStatus } from "../sync/status";
import { defaultShell, ShellProvider, type ShellState } from "./shell";

/** Arma el estado de las barras con lo que pasa en vivo (conexión y cola). */
export function LiveShell({ base, children }: { base?: Partial<ShellState>; children: ReactNode }) {
  const sync = useSyncStatus();
  const reg = useRegister();
  const value: ShellState = {
    ...defaultShell,
    ...base,
    register: reg.shift
      ? {
          open: true,
          cashier: reg.cashierName ?? undefined,
          since: formatTime(new Date(reg.shift.openedAt)),
        }
      : { open: false },
    connection: { online: sync.online, pending: sync.pendingSales, justSynced: sync.justDrained },
  };
  return <ShellProvider value={value}>{children}</ShellProvider>;
}
