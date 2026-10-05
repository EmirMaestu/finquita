import { Share, SquarePlus, X } from "lucide-react";
import { useState } from "react";

type Env = { userAgent: string; standalone: boolean; maxTouchPoints: number };

/** En iPhone no hay botón de instalar: hay que agregarla a inicio desde Safari. */
export function shouldShowInstallGuide(env: Env): boolean {
  if (env.standalone) return false;
  const ua = env.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && safari;
}

export function currentEnv(): Env {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    standalone: nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
  };
}

const KEY = "mostrador.installGuide";

export function InstallGuide({ env = currentEnv() }: { env?: Env }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "hidden";
    } catch {
      return false;
    }
  });
  if (hidden || !shouldShowInstallGuide(env)) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, "hidden");
    } catch {}
  };
  return (
    <section
      aria-label="Instalá Mostrador en tu iPhone"
      className="m-4 flex flex-col gap-3 rounded-card border border-borde bg-superficie p-4"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="text-base font-semibold">Instalá Mostrador en tu iPhone</div>
          <div className="text-[13px] text-texto-suave">
            Así abre más rápido, funciona sin internet y te llegan los avisos.
          </div>
        </div>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={close}
          className="inline-flex size-12 items-center justify-center text-texto-suave"
        >
          <X size={20} />
        </button>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[15px]">
        <li className="flex items-center gap-3">
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-primario-suave font-semibold text-primario">
            1
          </span>
          Tocá Compartir <Share size={20} aria-label="Compartir" className="text-info" />
        </li>
        <li className="flex items-center gap-3">
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-primario-suave font-semibold text-primario">
            2
          </span>
          Elegí Agregar a inicio <SquarePlus size={20} aria-hidden className="text-texto-suave" />
        </li>
      </ol>
    </section>
  );
}
