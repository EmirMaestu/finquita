import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { useViewport } from "../app/useViewport";
import { cx } from "./cx";

/**
 * Contenedor para acciones cortas: hoja que sube desde abajo en celular,
 * ventana modal en compu. Esc cierra.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const { layout } = useViewport();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
    };
    window.addEventListener("keydown", onKey);
    // El foco va al primer campo solo al abrir.
    const first = ref.current?.querySelector<HTMLElement>(
      "input, select, textarea, button[data-autofocus]",
    );
    first?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  const phone = layout === "phone";
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center lg:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "relative flex max-h-[92vh] w-full flex-col bg-superficie shadow-xl",
          phone
            ? "rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
            : cx("rounded-card", wide ? "max-w-3xl" : "max-w-lg"),
        )}
      >
        <div className="flex items-center gap-2 border-b border-borde py-2 pr-2 pl-5">
          <h2 className="m-0 flex-1 text-lg font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="inline-flex size-12 items-center justify-center rounded-lg text-texto-suave hover:bg-neutro-suave"
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex gap-2 border-t border-borde p-4">{footer}</div>}
      </div>
    </div>
  );
}
