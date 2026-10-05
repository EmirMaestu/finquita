import { CloudUpload, Wifi, WifiOff } from "lucide-react";
import type { ShellState } from "../app/shell";
import { cx } from "./cx";

export function connectionLabel(c: ShellState["connection"]): string {
  const ventas = c.pending === 1 ? "1 venta" : `${c.pending} ventas`;
  if (!c.online) return c.pending > 0 ? `Sin conexión · ${ventas} por sincronizar` : "Sin conexión";
  if (c.pending > 0) return `Sincronizando · ${ventas}`;
  return c.justSynced ? "Todo sincronizado" : "En línea";
}

export function ConnectionChip({
  connection,
  compact = false,
}: {
  connection: ShellState["connection"];
  compact?: boolean;
}) {
  const Icon = !connection.online ? WifiOff : connection.pending > 0 ? CloudUpload : Wifi;
  const tone = !connection.online
    ? "bg-alerta-suave text-alerta"
    : connection.pending > 0
      ? "bg-info-suave text-info"
      : "bg-exito-suave text-exito";
  const label = connectionLabel(connection);
  return (
    <output
      aria-label={label}
      className={cx(
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold",
        tone,
      )}
    >
      <Icon size={14} aria-hidden />
      {compact && connection.online && connection.pending === 0 && !connection.justSynced
        ? null
        : label}
    </output>
  );
}

export function registerLabel(r: ShellState["register"], short = false): string {
  if (!r?.open) return "Caja cerrada";
  if (short || !r.cashier) return "Caja abierta";
  return `Caja abierta · ${r.cashier}${r.since ? ` · desde ${r.since}` : ""}`;
}

export function RegisterChip({
  register,
  short = false,
}: {
  register: ShellState["register"];
  short?: boolean;
}) {
  const open = register?.open ?? false;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-borde font-medium",
        short ? "h-[30px] px-2.5 text-xs" : "h-8 px-3 text-[13px]",
      )}
    >
      <span
        aria-hidden
        className={cx("size-2 rounded-full", open ? "bg-exito" : "bg-texto-apagado")}
      />
      {registerLabel(register, short)}
    </span>
  );
}
