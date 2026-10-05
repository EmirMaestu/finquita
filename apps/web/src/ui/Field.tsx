import { CircleAlert } from "lucide-react";
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useId,
} from "react";
import { cx } from "./cx";

type FieldProps = {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
};

const control =
  "h-12 w-full rounded-lg border bg-superficie px-3 text-base text-texto outline-none lg:h-11 lg:text-[15px] placeholder:text-texto-apagado focus:border-2 focus:border-primario focus:px-[11px] focus:shadow-[0_0_0_3px_var(--primario-suave)] disabled:bg-fondo disabled:text-texto-apagado";

export const TextField = forwardRef<
  HTMLInputElement,
  FieldProps & InputHTMLAttributes<HTMLInputElement>
>(function TextField({ label, hint, error, className, ...rest }, ref) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cx("flex flex-col gap-1.5 text-[13px] font-semibold", className)}
    >
      {label}
      <input
        id={id}
        ref={ref}
        aria-invalid={Boolean(error)}
        className={cx(control, error ? "border-2 border-peligro px-[11px]" : "border-borde")}
        {...rest}
      />
      {error ? (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-peligro">
          <CircleAlert size={14} aria-hidden />
          {error}
        </span>
      ) : (
        hint && <span className="text-xs font-normal text-texto-suave">{hint}</span>
      )}
    </label>
  );
});

export function SelectField({
  label,
  hint,
  error,
  className,
  children,
  ...rest
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cx("flex flex-col gap-1.5 text-[13px] font-semibold", className)}
    >
      {label}
      <select id={id} className={cx(control, "border-borde")} {...rest}>
        {children}
      </select>
      {error ? (
        <span className="text-xs font-semibold text-peligro">{error}</span>
      ) : (
        hint && <span className="text-xs font-normal text-texto-suave">{hint}</span>
      )}
    </label>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[15px]">
      <span className="flex flex-1 flex-col">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-xs text-texto-suave">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cx(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-foco",
          checked ? "bg-primario" : "bg-borde",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 size-6 rounded-full bg-white shadow transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
    </label>
  );
}
