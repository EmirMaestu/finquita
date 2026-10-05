import { NavLink } from "react-router";
import { cx } from "../../ui/cx";
import { GROUPS, MODULES } from "../modules";
import { isVisible, useShell } from "../shell";

/** Barra lateral de compu (240 px), con los módulos en tres grupos. */
export function Sidebar() {
  const shell = useShell();
  return (
    <nav
      data-print-hide
      aria-label="Módulos"
      className="flex w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-borde bg-superficie p-3 text-sm"
    >
      {GROUPS.map((group) => {
        const items = MODULES.filter((m) => m.group === group && isVisible(shell, m.id));
        if (!items.length) return null;
        return (
          <div key={group} className="flex flex-col gap-1">
            <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[.06em] text-texto-suave">
              {group}
            </div>
            {items.map((m) => (
              <NavLink
                key={m.id}
                to={m.path}
                className={({ isActive }) =>
                  cx(
                    "flex h-10 items-center gap-3 rounded-lg px-3",
                    isActive
                      ? "bg-primario-suave font-semibold text-primario"
                      : "font-medium text-texto hover:bg-neutro-suave",
                  )
                }
              >
                <m.icon size={22} aria-hidden className="shrink-0" />
                <span className="flex-1">{m.label}</span>
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
