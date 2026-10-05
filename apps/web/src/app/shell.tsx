import { createContext, type ReactNode, useContext } from "react";
import type { ModuleId } from "./modules";

/** Lo que muestran las barras: negocio, usuario, caja, conexión y avisos. */
export type ShellState = {
  businessName: string;
  user: { name: string } | null;
  register: { open: boolean; cashier?: string; since?: string } | null;
  connection: { online: boolean; pending: number };
  unreadAlerts: number;
  /** Módulos visibles para el rol (lo que no puede usar, no aparece). */
  visibleModules: ModuleId[] | "all";
};

export const defaultShell: ShellState = {
  businessName: "Mostrador",
  user: null,
  register: null,
  connection: { online: true, pending: 0 },
  unreadAlerts: 0,
  visibleModules: "all",
};

const ShellContext = createContext<ShellState>(defaultShell);

export function ShellProvider({ value, children }: { value: ShellState; children: ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellState {
  return useContext(ShellContext);
}

export function isVisible(shell: ShellState, id: ModuleId): boolean {
  return shell.visibleModules === "all" || shell.visibleModules.includes(id);
}
