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
  /** Una ráfaga terminó sin ser un código: estos caracteres se frenaron y hay que devolverlos. */
  onRelease?: (chars: string) => void;
};

/**
 * Dónde cae la tecla. En un campo numérico (fondo, monto, cantidad) los dígitos nunca son un
 * código: el detector no interviene. En un teclado numérico de diálogo (cobro, peso, PIN) se
 * frena desde el primer dígito y se devuelve si no viene Enter rápido: así la pistola no
 * escribe adentro del cobro y lo tipeado a mano llega entero.
 */
export type KeyContext = { numeric?: boolean; keypad?: boolean };

/** Los códigos del almacén son numéricos (EAN-13, EAN-8, UPC y los internos de la planilla). */
const PRINTABLE = /^[0-9]$/;

/**
 * Reconoce la pistola lectora por la velocidad de tipeo, en cualquier pantalla y sin
 * tocar el buscador: una ráfaga de caracteres rápidos terminada en Enter (o Tab, o un
 * silencio) es un código. Mientras la ráfaga es rápida se frena la escritura en el
 * campo con foco, así el código no queda tipeado en ningún lado (salvo el primer
 * carácter, que se informa para que el campo lo saque).
 */
export function createScanDetector(opts: Omit<ScannerOptions, "enabled">) {
  const minLength = opts.minLength ?? 4;
  const maxGap = opts.maxGapMs ?? 50;
  const idleMs = opts.idleMs ?? 80;
  const clock = opts.now;
  let buffer = "";
  let swallowed = "";
  let last = 0;
  let fast = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    buffer = "";
    swallowed = "";
    fast = false;
    if (timer) clearTimeout(timer);
    timer = null;
  };
  /** Corta la ráfaga: lo frenado vuelve al campo. */
  const reset = () => {
    const back = swallowed;
    clear();
    if (back) opts.onRelease?.(back);
  };
  let keypad = false;
  const finish = (byKey = false) => {
    const code = buffer;
    // En un teclado numérico, una ráfaga que termina sola (sin Enter ni Tab) es tipeo rápido,
    // y una corta con Enter ("10000" + Enter) también: solo un código de barras entero
    // (8 dígitos o más) cuenta como escaneo ahí.
    if (fast && code.length >= (keypad ? 8 : minLength) && (byKey || !keypad)) {
      clear();
      opts.onScan(code);
      return true;
    }
    reset();
    return false;
  };

  return {
    /** Devuelve true si la tecla se usó para el código (y hay que cancelarla). */
    keydown(
      e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey"> & { timeStamp?: number },
      ctx: KeyContext = {},
    ): boolean {
      if (ctx.numeric) {
        reset();
        return false;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        reset();
        return false;
      }
      // La hora del evento de entrada, no la del manejador: si la pantalla está ocupada
      // renderizando, los eventos llegan tarde pero con su hora real.
      const t = clock ? clock() : (e.timeStamp ?? performance.now());
      if (e.key === "Enter" || e.key === "Tab") {
        if (buffer && t - last <= maxGap * 3) return finish(true);
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
        reset();
        buffer = e.key;
        keypad = Boolean(ctx.keypad);
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => finish(false), idleMs);
      // Desde el segundo carácter rápido, la escritura se frena (en un teclado numérico, desde
      // el primero: lo que no sea código vuelve enseguida).
      if (fast || keypad) swallowed += e.key;
      return fast || keypad;
    },
    reset,
  };
}

/** Un campo donde solo se tipean números: ahí los dígitos nunca son un código. */
export function isNumericField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;
  const mode = el.inputMode || el.getAttribute("inputmode") || "";
  return (
    mode === "numeric" ||
    mode === "decimal" ||
    (el instanceof HTMLInputElement && el.type === "number") ||
    el.dataset.scan === "off"
  );
}

/**
 * Dentro de un diálogo con teclado numérico (data-keypad): cobro, peso, PIN. Un teclado de PIN
 * a pantalla completa (data-keypad-global) cuenta aunque el foco esté en el cuerpo de la página.
 */
export function inKeypad(el: EventTarget | null): boolean {
  if (el instanceof Element && el.closest("[data-keypad]")) return true;
  return typeof document !== "undefined" && Boolean(document.querySelector("[data-keypad-global]"));
}

/** Teclas devueltas por el detector: se vuelven a mandar y el detector no las mira. */
let releasing = false;

export function useScanner({ onScan, enabled = true, ...rest }: ScannerOptions) {
  const cb = useRef(onScan);
  cb.current = onScan;
  // Las opciones se leen una vez por pantalla: no recrean el detector en cada render.
  const options = useRef(rest);
  useEffect(() => {
    if (!enabled) return;
    let target: EventTarget | null = null;
    const detector = createScanDetector({
      ...options.current,
      onScan: (c) => cb.current(c),
      onRelease: (chars) => {
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          if (document.activeElement === target) insertText(target, chars);
        } else if (target instanceof Element && inKeypad(target)) {
          // El teclado numérico del diálogo recibe las teclas como si recién se tipearan.
          releasing = true;
          try {
            for (const key of chars)
              target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
          } finally {
            releasing = false;
          }
        }
      },
    });
    const handler = (e: KeyboardEvent) => {
      if (releasing) return;
      target = e.target;
      if (detector.keydown(e, { numeric: isNumericField(target), keypad: inKeypad(target) })) {
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

/** Escribe en un campo como si se hubiera tipeado (React se entera por el evento input). */
function insertText(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.setRangeText(text, start, end, "end");
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Saca del final de un texto el primer carácter de un código escaneado que se coló. */
export function stripScanLeak(value: string, code: string): string {
  return value.endsWith(code[0] ?? "") ? value.slice(0, -1) : value;
}
