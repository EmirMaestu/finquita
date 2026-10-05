import { NavLink } from "react-router";
import { cx } from "../../ui/cx";
import { MODULES } from "../modules";
import { isVisible, useShell } from "../shell";

/** Riel de íconos (64 px): tablet vertical y barra lateral colapsada. */
export function Rail() {
  const shell = useShell();
  return (
    <nav
      data-print-hide
      aria-label="Módulos"
      className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-borde bg-superficie px-2 py-3"
    >
      {MODULES.filter((m) => isVisible(shell, m.id)).map((m) => (
        <NavLink
          key={m.id}
          to={m.path}
          title={m.label}
          aria-label={m.label}
          className={({ isActive }) =>
            cx(
              "flex h-11 w-12 items-center justify-center rounded-lg",
              isActive
                ? "bg-primario-suave text-primario"
                : "text-texto-suave hover:bg-neutro-suave",
            )
          }
        >
          <m.icon size={24} aria-hidden />
        </NavLink>
      ))}
    </nav>
  );
}
