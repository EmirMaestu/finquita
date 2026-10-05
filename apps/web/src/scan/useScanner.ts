import { useEffect, useRef } from "react";

export type ScannerOptions = {
  onScan: (code: string) => void;
  enabled?: boolean;
  /** Largo mínimo de un código (EAN-8 = 8; PLU de 4 en la planilla). */
  minLength?: number;
  /** Tiempo máximo entre teclas para considerarlo pistola (una persona tipea más lento). */
  maxGapMs?: number;
  /** Sin Enter al final: se da por terminado después de este silencio. */
  idleMs?: number;
  /** Reloj (para tests). */
  now?: () => number;
};

const PRINTABLE = /^[0-9A-Za-z\-.]$/;

/**
 * Reconoce la pistola lectora por la velocidad de tipeo, en cualquier pantalla y sin
 * tocar el buscador: una ráfaga de caracteres rápidos terminada en Enter (o Tab, o un
 * silencio) es un código. Mientras la ráfaga es rápida se frena la escritura en el
 * campo con foco, así el código no queda tipeado en ningún lado (salvo el primer
 * carácter, que se informa para que el campo lo saque).
 */
export function createScanDetector(opts: Omit<ScannerOptions, "enabled">) {
  const minLength = opts.minLength ?? 4;
  const maxGap = opts.maxGapMs ?? 35;
  const idleMs = opts.idleMs ?? 80;
  const now = opts.now ?? (() => performance.now());
  let buffer = "";
  let last = 0;
  let fast = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const reset = () => {
    buffer = "";
    fast = false;
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const finish = () => {
    const code = buffer;
    const wasFast = fast;
    reset();
    if (wasFast && code.length >= minLength) {
      opts.onScan(code);
      return true;
    }
    return false;
  };

  return {
    /** Devuelve true si la tecla se usó para el código (y hay que cancelarla). */
    keydown(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): boolean {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        reset();
        return false;
      }
      const t = now();
      if (e.key === "Enter" || e.key === "Tab") {
        if (buffer && t - last <= maxGap * 3) return finish();
        reset();
        return false;
      }
      if (!PRINTABLE.test(e.key)) {
        if (e.key !== "Shift") reset();
        return false;
      }
      const gap = t - last;
      last = t;
      if (buffer && gap <= maxGap) {
        buffer += e.key;
        fast = true;
      } else {
        buffer = e.key;
        fast = false;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(finish, idleMs);
      // Desde el segundo carácter rápido, la escritura se frena.
      return fast;
    },
    reset,
  };
}

export function useScanner({ onScan, enabled = true, ...rest }: ScannerOptions) {
  const cb = useRef(onScan);
  cb.current = onScan;
  // Las opciones se leen una vez por pantalla: no recrean el detector en cada render.
  const options = useRef(rest);
  useEffect(() => {
    if (!enabled) return;
    const detector = createScanDetector({ ...options.current, onScan: (c) => cb.current(c) });
    const handler = (e: KeyboardEvent) => {
      if (detector.keydown(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
      detector.reset();
    };
  }, [enabled]);
}

/** Saca del final de un texto el primer carácter de un código escaneado que se coló. */
export function stripScanLeak(value: string, code: string): string {
  return value.endsWith(code[0] ?? "") ? value.slice(0, -1) : value;
}
