import { LogOut, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { credentials } from "../data/api";
import { lockScreen } from "./lock";
import { useSignOut } from "./session";
import { useShell } from "./shell";

/** Avatar: cambio rápido de usuario (en dispositivos habilitados) y salir. */
export function UserMenu() {
  const shell = useShell();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);
  const hasDevice = Boolean(credentials.get().deviceToken);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Usuario: ${shell.user?.name ?? ""}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex size-9 items-center justify-center rounded-full bg-acento-suave text-sm font-semibold text-texto"
      >
        {shell.user?.name.charAt(0).toUpperCase() ?? "?"}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-11 right-0 z-30 flex w-56 flex-col rounded-card border border-borde bg-superficie p-1 shadow-lg"
        >
          <div className="px-3 py-2 text-[13px] text-texto-suave">{shell.user?.name}</div>
          {hasDevice && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                lockScreen.open();
              }}
              className="flex h-10 items-center gap-2 rounded-lg px-3 text-left text-sm font-medium hover:bg-neutro-suave"
            >
              <Users size={18} aria-hidden /> Cambiar de usuario
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            className="flex h-10 items-center gap-2 rounded-lg px-3 text-left text-sm font-medium hover:bg-neutro-suave"
          >
            <LogOut size={18} aria-hidden /> Salir
          </button>
        </div>
      )}
    </div>
  );
}
