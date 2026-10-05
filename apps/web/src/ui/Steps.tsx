import { Check } from "lucide-react";
import { cx } from "./cx";

/** Asistente por pasos: los hechos con tilde, el actual resaltado. */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol
      className="m-0 flex list-none flex-wrap items-center gap-2 p-0 text-[13px] font-semibold"
      aria-label="Pasos"
    >
      {steps.map((s, i) => (
        <li
          key={s}
          aria-current={i === current ? "step" : undefined}
          className={cx("flex items-center gap-2", i > current && "text-texto-suave")}
        >
          <span
            className={cx(
              "inline-flex size-6 items-center justify-center rounded-full text-xs",
              i < current
                ? "bg-primario text-sobre-primario"
                : i === current
                  ? "bg-texto text-fondo"
                  : "border border-borde",
            )}
          >
            {i < current ? <Check size={14} aria-hidden /> : i + 1}
          </span>
          {s}
          {i < steps.length - 1 && <span aria-hidden className="mx-1 h-px w-6 bg-borde" />}
        </li>
      ))}
    </ol>
  );
}
