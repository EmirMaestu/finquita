import { Lock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cx } from "./cx";
import { NumPad } from "./NumPad";

const DOTS = ["d1", "d2", "d3", "d4", "d5", "d6"];

/**
 * Teclado de PIN con puntos. Manda el PIN al completar `length` dígitos
 * (o al apretar Enter con 4 a 6).
 */
export function PinPad({
  title,
  subtitle,
  onSubmit,
  onCancel,
  error,
  busy,
  length = 4,
}: {
  title: string;
  subtitle?: string;
  onSubmit: (pin: string) => void;
  onCancel?: () => void;
  error?: string | null;
  busy?: boolean;
  length?: number;
}) {
  const [pin, setPin] = useState("");
  useEffect(() => {
    if (error) setPin("");
  }, [error]);
  const onKey = useCallback(
    (k: string) => {
      if (busy) return;
      setPin((p) => {
        if (k === "back") return p.slice(0, -1);
        if (p.length >= 6) return p;
        const next = p + k;
        if (next.length === length) setTimeout(() => onSubmit(next), 0);
        return next;
      });
    },
    [busy, length, onSubmit],
  );
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Enter" && pin.length >= 4) onSubmit(pin);
      if (e.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [pin, onSubmit, onCancel]);
  return (
    <div className="flex w-full max-w-[320px] flex-col gap-4">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-alerta-suave text-alerta">
          <Lock size={22} aria-hidden />
        </span>
        <div className="text-xl font-semibold">{title}</div>
        {subtitle && <div className="text-[13px] text-texto-suave">{subtitle}</div>}
      </div>
      <div className="flex justify-center gap-3.5" role="img" aria-label={`${pin.length} dígitos`}>
        {DOTS.slice(0, Math.max(length, pin.length)).map((d, i) => (
          <span
            key={d}
            className={cx(
              "size-3.5 rounded-full",
              i < pin.length ? "bg-texto" : "border-2 border-texto-apagado",
            )}
          />
        ))}
      </div>
      {error && (
        <div role="alert" className="text-center text-[13px] font-semibold text-peligro">
          {error}
        </div>
      )}
      <NumPad onKey={onKey} big />
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="h-11 rounded-lg text-sm font-semibold text-texto-suave hover:bg-neutro-suave"
        >
          Cancelar
        </button>
      )}
    </div>
  );
}
