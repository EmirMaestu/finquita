import { Check, Minus } from "lucide-react";
import { useId } from "react";
import { cx } from "./cx";

/** Casilla de selección (nativa, con el estilo del diseño). */
export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  showLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean) => void;
  label: string;
  /** Muestra el texto al lado de la casilla (si no, queda solo para el lector de pantalla). */
  showLabel?: boolean;
}) {
  const on = checked || indeterminate;
  const id = useId();
  const box = (
    <span className="relative inline-flex size-[18px] shrink-0">
      <input
        id={id}
        type="checkbox"
        aria-label={label}
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = Boolean(indeterminate);
        }}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.checked)}
        className={cx(
          "peer size-[18px] cursor-pointer appearance-none rounded border-[1.5px]",
          on ? "border-primario bg-primario" : "border-texto-suave bg-superficie",
        )}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 inline-flex items-center justify-center text-sobre-primario"
      >
        {indeterminate ? (
          <Minus size={12} strokeWidth={3} />
        ) : checked ? (
          <Check size={12} strokeWidth={3} />
        ) : null}
      </span>
    </span>
  );
  if (!showLabel) return box;
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      {box}
      <span>{label}</span>
    </label>
  );
}
