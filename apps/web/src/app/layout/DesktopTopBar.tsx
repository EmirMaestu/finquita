import { Bell, PanelLeft, Search } from "lucide-react";
import { ConnectionChip, RegisterChip } from "../../ui/StatusChips";
import { useShell } from "../shell";
import { UserMenu } from "../UserMenu";

export function DesktopTopBar({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const shell = useShell();
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-borde bg-superficie px-4">
      <div className="flex w-[208px] items-center gap-2.5">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Mostrar u ocultar la barra lateral"
            className="inline-flex size-8 items-center justify-center rounded-lg text-texto-suave hover:bg-neutro-suave"
          >
            <PanelLeft size={18} />
          </button>
        )}
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primario text-sm font-bold text-sobre-primario">
          M
        </span>
        <span className="truncate text-sm font-semibold">{shell.businessName}</span>
      </div>
      <button
        type="button"
        className="flex h-9 max-w-[420px] flex-1 items-center gap-2 rounded-lg border border-borde bg-fondo px-2.5 text-[13px] text-texto-suave"
      >
        <Search size={16} aria-hidden />
        <span className="flex-1 text-left">Buscar</span>
        <kbd className="rounded border border-borde px-1.5 py-px text-[11px] font-semibold">
          Ctrl K
        </kbd>
      </button>
      <div className="flex-1" />
      <RegisterChip register={shell.register} />
      <ConnectionChip connection={shell.connection} />
      <button
        type="button"
        aria-label={`Avisos${shell.unreadAlerts ? `: ${shell.unreadAlerts} sin leer` : ""}`}
        className="relative inline-flex size-10 items-center justify-center rounded-lg hover:bg-neutro-suave"
      >
        <Bell size={22} aria-hidden />
        {shell.unreadAlerts > 0 && (
          <span className="absolute top-2 right-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-peligro px-1 text-[10px] font-bold text-white">
            {shell.unreadAlerts}
          </span>
        )}
      </button>
      <UserMenu />
    </header>
  );
}
