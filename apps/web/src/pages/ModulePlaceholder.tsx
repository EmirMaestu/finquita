import { useLocation } from "react-router";
import { moduleForPath } from "../app/modules";

/** Pantalla provisoria de un módulo que todavía no se construyó. */
export function ModulePlaceholder() {
  const { pathname } = useLocation();
  const mod = moduleForPath(pathname);
  return (
    <div className="flex flex-col gap-3 p-4 lg:p-6">
      <h2 className="m-0 text-[22px] font-semibold tracking-[-.01em]">{mod?.label}</h2>
      <div className="flex h-32 items-center justify-center rounded-card border border-dashed border-borde text-[13px] text-texto-suave">
        Esta pantalla está en construcción.
      </div>
    </div>
  );
}
