import { CircleAlert, Lock, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { cx } from "./cx";

/** Esqueleto de carga. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-lg bg-neutro-suave", className)} />;
}

export function SkeletonList({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Cargando" className={cx("flex flex-col gap-2", className)}>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: filas fijas de esqueleto
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

/** Estado vacío con la primera acción. */
export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-borde bg-superficie px-6 py-10 text-center">
      {icon && <div className="text-texto-suave">{icon}</div>}
      <div className="text-base font-semibold">{title}</div>
      {body && <div className="max-w-md text-sm text-texto-suave">{body}</div>}
      {action}
    </div>
  );
}

/** Error con Reintentar: dice qué hacer, no qué falló adentro. */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie px-6 py-10 text-center"
    >
      <CircleAlert size={28} className="text-peligro" aria-hidden />
      <div className="text-base font-semibold">No pudimos cargar esto</div>
      <div className="max-w-md text-sm text-texto-suave">
        {message ?? "Revisá la conexión y probá de nuevo."}
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

/** Sin permiso: dice qué rol puede. */
export function NoPermission({ who }: { who: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-borde bg-superficie px-6 py-10 text-center">
      <Lock size={28} className="text-texto-suave" aria-hidden />
      <div className="text-base font-semibold">No tenés permiso para ver esto</div>
      <div className="text-sm text-texto-suave">Lo puede ver: {who}.</div>
    </div>
  );
}

/** Banner de sin conexión: lo que se ve es la última copia. */
export function OfflineBanner({ children }: { children?: ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-lg bg-alerta-suave px-3 py-2 text-[13px] font-semibold text-alerta"
    >
      <WifiOff size={16} aria-hidden />
      {children ?? "Sin conexión: estás viendo la última copia guardada."}
    </div>
  );
}
