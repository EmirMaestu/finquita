import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { BOTTOM_BAR, MODULES } from "../app/modules";
import { isVisible, useShell } from "../app/shell";

/** "Más" del celular: los módulos que no entran en la barra inferior. */
export function MorePage() {
  const shell = useShell();
  const items = MODULES.filter((m) => !BOTTOM_BAR.includes(m.id) && isVisible(shell, m.id));
  return (
    <ul className="m-0 flex list-none flex-col p-4">
      {items.map((m) => (
        <li key={m.id}>
          <Link
            to={m.path}
            className="flex min-h-14 items-center gap-3 border-b border-borde text-base text-texto no-underline"
          >
            <m.icon size={24} aria-hidden className="text-texto-suave" />
            <span className="flex-1">{m.label}</span>
            <ChevronRight size={20} aria-hidden className="text-texto-suave" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
