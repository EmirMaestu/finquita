import { Bell, ScanBarcode } from "lucide-react";
import { scanRouter } from "../../scan/GlobalScan";
import { ConnectionChip, RegisterChip } from "../../ui/StatusChips";
import { useShell } from "../shell";

export function MobileTopBar({ title }: { title: string }) {
  const shell = useShell();
  const showConnection = !shell.connection.online || shell.connection.pending > 0;
  return (
    <header
      data-print-hide
      className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-borde bg-superficie pr-2 pl-4 pt-[env(safe-area-inset-top)]"
    >
      <h1 className="m-0 flex-1 truncate text-xl font-semibold">{title}</h1>
      {showConnection ? (
        <ConnectionChip connection={shell.connection} compact />
      ) : (
        <RegisterChip register={shell.register} short />
      )}
      <button
        type="button"
        aria-label={`Avisos${shell.unreadAlerts ? `: ${shell.unreadAlerts} sin leer` : ""}`}
        className="relative inline-flex size-12 items-center justify-center"
      >
        <Bell size={24} aria-hidden />
        {shell.unreadAlerts > 0 && (
          <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-peligro" />
        )}
      </button>
      <button
        type="button"
        aria-label="Escanear"
        onClick={() => scanRouter.openCamera()}
        className="inline-flex size-12 items-center justify-center text-primario"
      >
        <ScanBarcode size={26} aria-hidden />
      </button>
    </header>
  );
}
