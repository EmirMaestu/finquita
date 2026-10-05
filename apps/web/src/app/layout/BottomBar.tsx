import { NavLink } from "react-router";
import { cx } from "../../ui/cx";
import { BOTTOM_BAR, MODULES, MORE_ITEM } from "../modules";
import { isVisible, useShell } from "../shell";

/** Barra inferior del celular: cinco lugares. Vender no aparece si el rol no vende. */
export function BottomBar() {
  const shell = useShell();
  const items = BOTTOM_BAR.filter((id) => isVisible(shell, id))
    .map((id) => MODULES.find((m) => m.id === id))
    .filter((m) => m !== undefined)
    .map((m) => ({ label: m.label, path: m.path, icon: m.icon }));
  items.push(MORE_ITEM);
  return (
    <nav
      data-print-hide
      aria-label="Módulos"
      className="fixed inset-x-0 bottom-0 z-20 grid border-t border-borde bg-superficie px-1 pt-1.5 pb-[max(18px,env(safe-area-inset-bottom))]"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((it) => (
        <NavLink
          key={it.path}
          to={it.path}
          className={({ isActive }) =>
            cx(
              "flex min-h-12 flex-col items-center justify-center gap-1 text-[11px]",
              isActive ? "font-semibold text-primario" : "font-medium text-texto-suave",
            )
          }
        >
          <it.icon size={26} aria-hidden />
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}
