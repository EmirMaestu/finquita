import { Check, Minus } from "lucide-react";
import { cx } from "./cx";

/** Casilla de selección (nativa, con el estilo del diseño). */
export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  const on = checked || indeterminate;
  return (
    <span className="relative inline-flex size-[18px] shrink-0">
      <input
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
}
