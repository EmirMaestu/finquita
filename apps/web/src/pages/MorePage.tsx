import { ChevronRight, LogOut, Users } from "lucide-react";
import { Link } from "react-router";
import { lockScreen } from "../app/lock";
import { BOTTOM_BAR, MODULES } from "../app/modules";
import { useSignOut } from "../app/session";
import { isVisible, useShell } from "../app/shell";
import { credentials } from "../data/api";

/** "Más" del celular: los módulos que no entran en la barra inferior. */
export function MorePage() {
  const shell = useShell();
  const items = MODULES.filter((m) => !BOTTOM_BAR.includes(m.id) && isVisible(shell, m.id));
  const signOut = useSignOut();
  const hasDevice = Boolean(credentials.get().deviceToken);
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
      {hasDevice && (
        <li>
          <button
            type="button"
            onClick={() => lockScreen.open()}
            className="flex min-h-14 w-full items-center gap-3 border-b border-borde text-left text-base"
          >
            <Users size={24} aria-hidden className="text-texto-suave" />
            Cambiar de usuario
          </button>
        </li>
      )}
      <li>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex min-h-14 w-full items-center gap-3 text-left text-base text-peligro"
        >
          <LogOut size={24} aria-hidden />
          Salir
        </button>
      </li>
    </ul>
  );
}
