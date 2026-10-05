import {
  Check,
  CircleAlert,
  CircleHelp,
  Clock,
  Lock,
  type LucideIcon,
  Pencil,
  ShieldAlert,
  Tag,
  TrendingDown,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";

export type Tone = "ok" | "alerta" | "peligro" | "info" | "neutro" | "acento" | "primario";

const TONE: Record<Tone, string> = {
  ok: "bg-exito-suave text-exito",
  alerta: "bg-alerta-suave text-alerta",
  peligro: "bg-peligro-suave text-peligro",
  info: "bg-info-suave text-info",
  neutro: "bg-neutro-suave text-texto-suave",
  acento: "bg-acento-suave text-texto",
  primario: "bg-primario-suave text-primario",
};

/** Chip de estado: siempre ícono y palabra, nunca solo color. */
export function Chip({
  tone = "neutro",
  icon: Icon,
  children,
  className,
  size = "sm",
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cx(
        "inline-flex w-max max-w-full items-center gap-1.5 rounded-full font-semibold whitespace-nowrap",
        size === "sm" ? "h-6 pr-2 pl-1.5 text-xs" : "h-8 px-3 text-[13px]",
        TONE[tone],
        className,
      )}
    >
      {Icon && <Icon size={size === "sm" ? 12 : 14} aria-hidden className="shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export const CHIP_ICONS = {
  ok: Check,
  low: TriangleAlert,
  out: CircleAlert,
  negative: CircleAlert,
  expiry: Clock,
  losing: TrendingDown,
  review: Tag,
  noCost: CircleHelp,
  adult: ShieldAlert,
  fixed: Lock,
  complete: Pencil,
} satisfies Record<string, LucideIcon>;

/** Chip de filtro (activo en tinta, como en el diseño). */
export function FilterChip({
  active,
  onClick,
  children,
  count,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold",
        active
          ? "border-texto bg-texto text-fondo"
          : "border-borde bg-superficie text-texto hover:bg-neutro-suave",
      )}
    >
      {children}
      {count !== undefined && <span className={active ? "" : "text-texto-suave"}>· {count}</span>}
    </button>
  );
}
