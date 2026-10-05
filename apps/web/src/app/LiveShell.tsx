import { formatTime } from "@mostrador/shared";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRegister } from "../cash/useRegister";
import { api } from "../data/api";
import { useSyncStatus } from "../sync/status";
import { defaultShell, ShellProvider, type ShellState } from "./shell";

/** Arma el estado de las barras con lo que pasa en vivo (conexión y cola). */
export function LiveShell({ base, children }: { base?: Partial<ShellState>; children: ReactNode }) {
  const sync = useSyncStatus();
  const reg = useRegister();
  // Campana: avisos sin leer (se mira cada minuto y al volver a la app).
  const alerts = useQuery({
    queryKey: ["alerts-count"],
    queryFn: () => api<{ unread: number }>("/api/alerts/count"),
    refetchInterval: 60_000,
    retry: false,
  });
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
    unreadAlerts: alerts.data?.unread ?? 0,
  };
  return <ShellProvider value={value}>{children}</ShellProvider>;
}
