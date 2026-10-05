import { Lock } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "xl";

const VARIANT: Record<Variant, string> = {
  primary: "bg-primario text-sobre-primario hover:bg-primario-hover border-0",
  secondary: "bg-superficie text-texto border border-borde hover:bg-neutro-suave",
  ghost: "bg-transparent text-primario hover:bg-primario-suave border-0",
  danger: "bg-peligro text-white hover:bg-peligro-hover border-0",
};

const SIZE: Record<Size, string> = {
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
  xl: "h-14 px-6 text-lg",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Acción que pide PIN: se muestra con candado, no se esconde. */
  locked?: boolean;
  icon?: ReactNode;
};

/** Botón del sistema de diseño: una acción principal por pantalla. */
export function Button({
  variant = "primary",
  size = "md",
  locked,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cx(
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:border-deshabilitado disabled:bg-deshabilitado disabled:text-texto-apagado",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {locked && <Lock size={16} aria-label="Pide PIN" />}
      {icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-12 shrink-0 items-center justify-center rounded-lg text-texto hover:bg-neutro-suave lg:size-10",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
