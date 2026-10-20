import { Bell, ScanBarcode, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { scanRouter } from "../../scan/GlobalScan";
import { ConnectionChip, RegisterChip } from "../../ui/StatusChips";
import { globalSearch } from "../GlobalSearch";
import { useCan } from "../session";
import { useShell } from "../shell";

export function MobileTopBar({ title }: { title: string }) {
  const shell = useShell();
  const navigate = useNavigate();
  const hasShift = useCan("shift");
  const showConnection =
    !shell.connection.online ||
    shell.connection.pending > 0 ||
    Boolean(shell.connection.justSynced);
  return (
    <header
      data-print-hide
      className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1 overflow-hidden border-b border-borde bg-superficie pr-2 pl-4 pt-[env(safe-area-inset-top)]"
    >
      <h1 className="m-0 min-w-[5.5rem] flex-1 shrink-0 truncate text-xl font-semibold">{title}</h1>
      {/* El aviso se recorta antes que empujar la barra fuera de la pantalla (ronda 3). */}
      <span className="flex min-w-0 shrink overflow-hidden">
        {showConnection ? (
          <ConnectionChip connection={shell.connection} compact />
        ) : hasShift ? (
          <RegisterChip register={shell.register} short />
        ) : null}
      </span>
      <button
        type="button"
        aria-label="Buscar en todo"
        title="Buscar"
        onClick={() => globalSearch.open()}
        className="inline-flex h-11 min-w-11 px-0.5 flex-col items-center justify-center gap-0.5 text-[10px] leading-none font-medium"
      >
        <Search size={20} aria-hidden />
        <span aria-hidden>Buscar</span>
      </button>
      <button
        type="button"
        aria-label={`Avisos${shell.unreadAlerts ? `: ${shell.unreadAlerts} sin leer` : ""}`}
        onClick={() => navigate("/avisos")}
        className="relative inline-flex h-11 min-w-11 px-0.5 flex-col items-center justify-center gap-0.5 text-[10px] leading-none font-medium"
      >
        <Bell size={20} aria-hidden />
        <span aria-hidden>Avisos</span>
        {shell.unreadAlerts > 0 && (
          <span className="absolute top-1 right-2.5 size-2 rounded-full bg-peligro" />
        )}
      </button>
      <button
        type="button"
        aria-label="Escanear un código con la cámara"
        title="Escanear un código"
        onClick={() => scanRouter.openCamera()}
        className="inline-flex h-11 min-w-11 px-0.5 flex-col items-center justify-center gap-0.5 text-[10px] leading-none font-medium text-primario"
      >
        <ScanBarcode size={22} aria-hidden />
        <span aria-hidden>Escanear</span>
      </button>
    </header>
  );
}
