import { Pause } from "lucide-react";
import { useNavigate } from "react-router";
import { useHeldSales } from "../../sell/store";
import { ConnectionChip, RegisterChip } from "../../ui/StatusChips";
import { useShell } from "../shell";
import { UserMenu } from "../UserMenu";

/** Barra del modo mostrador: negocio · Vender, caja, conexión, ventas en espera y usuario. */
export function CounterTopBar() {
  const shell = useShell();
  const held = useHeldSales();
  const navigate = useNavigate();
  return (
    <header
      data-print-hide
      className="flex h-14 shrink-0 items-center gap-4 border-b border-borde bg-superficie px-4"
    >
      <button
        type="button"
        onClick={() => navigate("/inicio")}
        className="flex items-center gap-2.5"
        aria-label="Ir a Inicio"
      >
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primario text-sm font-bold text-sobre-primario">
          M
        </span>
        <span className="font-semibold">{shell.businessName}</span>
        <span className="text-texto-suave">· Vender</span>
      </button>
      <div className="flex-1" />
      <RegisterChip register={shell.register} />
      <ConnectionChip connection={shell.connection} />
      <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-borde px-3 text-[13px] font-semibold">
        <Pause size={16} aria-hidden />
        En espera
        <span className="rounded-full bg-acento-suave px-1.5 text-[11px]">{held.length}</span>
      </span>
      <UserMenu />
    </header>
  );
}
