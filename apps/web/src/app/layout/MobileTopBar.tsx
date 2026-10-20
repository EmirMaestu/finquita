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
      className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-borde bg-superficie pr-2 pl-4 pt-[env(safe-area-inset-top)]"
    >
      <h1 className="m-0 flex-1 truncate text-xl font-semibold">{title}</h1>
      {showConnection ? (
        <ConnectionChip connection={shell.connection} compact />
      ) : hasShift ? (
        <RegisterChip register={shell.register} short />
      ) : null}
      <button
        type="button"
        aria-label="Buscar en todo"
        title="Buscar"
        onClick={() => globalSearch.open()}
        className="inline-flex size-12 items-center justify-center"
      >
        <Search size={24} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Avisos${shell.unreadAlerts ? `: ${shell.unreadAlerts} sin leer` : ""}`}
        onClick={() => navigate("/avisos")}
        className="relative inline-flex size-12 items-center justify-center"
      >
        <Bell size={24} aria-hidden />
        {shell.unreadAlerts > 0 && (
          <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-peligro" />
        )}
      </button>
      <button
        type="button"
        aria-label="Escanear un código con la cámara"
        title="Escanear un código"
        onClick={() => scanRouter.openCamera()}
        className="inline-flex size-12 items-center justify-center text-primario"
      >
        <ScanBarcode size={26} aria-hidden />
      </button>
    </header>
  );
}
