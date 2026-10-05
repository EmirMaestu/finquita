import { Minus, Plus } from "lucide-react";
import { cx } from "./cx";

/** Stepper − / + (conteo por billete, cantidad en Vender). */
export function Stepper({
  value,
  onChange,
  min = 0,
  label,
  big,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  label: string;
  big?: boolean;
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
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ""));
          onChange(Number.isFinite(n) ? Math.max(min, n) : min);
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
