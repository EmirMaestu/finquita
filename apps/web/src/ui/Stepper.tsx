import { Minus, Plus } from "lucide-react";
import { cx } from "./cx";
import { toast } from "./toast";

/** Stepper − / + (conteo por billete, cantidad en Vender). */
export function Stepper({
  value,
  onChange,
  min = 0,
  label,
  big,
  autoFocus,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  label: string;
  big?: boolean;
  autoFocus?: boolean;
}) {
  const size = big ? "size-12" : "size-9";
  return (
    <span className="inline-flex w-max items-center overflow-hidden rounded-lg border border-borde bg-superficie">
      <button
        type="button"
        aria-label={`Restar ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={cx(
          size,
          "inline-flex items-center justify-center text-texto disabled:text-texto-apagado",
        )}
      >
        <Minus size={18} />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        ref={(el) => {
          // Foco al aparecer (el primer billete del arqueo, con teclado).
          if (el && autoFocus && document.activeElement !== el && !el.dataset.focused) {
            el.dataset.focused = "1";
            el.focus();
          }
        }}
        onFocus={(e) => e.currentTarget.select()}
        value={value}
        onKeyDown={(e) => {
          if (e.key.length === 1 && /[^\d]/.test(e.key) && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            toast({
              text: "Solo números enteros: cuántos hay de ese billete.",
              tone: "error",
              ms: 2500,
            });
          }
        }}
        onChange={(e) => {
          // "1,5", "-5" o "1e2" no son cantidades de billetes: se ignoran, no se adivinan.
          if (/\D/.test(e.target.value)) return;
          const n = Number(e.target.value || "0");
          onChange(Number.isFinite(n) ? Math.min(9999, Math.max(min, n)) : min);
        }}
        className="tnum w-12 bg-transparent text-center font-semibold outline-none"
      />
      <button
        type="button"
        aria-label={`Sumar ${label}`}
        onClick={() => onChange(value + 1)}
        className={cx(size, "inline-flex items-center justify-center text-texto")}
      >
        <Plus size={18} />
      </button>
    </span>
  );
}
