import { Check, CircleAlert, Info } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { cx } from "./cx";

export type Toast = {
  id: number;
  text: string;
  tone?: "ok" | "error" | "info";
  action?: { label: string; run: () => void };
  ms?: number;
};

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

/** Aviso en pantalla ("Agregado: Yerba 1 kg"), con Deshacer opcional. */
export function toast(t: Omit<Toast, "id">): number {
  const id = ++seq;
  toasts = [...toasts.slice(-2), { ...t, id }];
  emit();
  return id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
    () => toasts,
  );
}

function ToastItem({ t }: { t: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(t.id), t.ms ?? 2500);
    return () => clearTimeout(timer);
  }, [t.id, t.ms]);
  const Icon = t.tone === "error" ? CircleAlert : t.tone === "info" ? Info : Check;
  return (
    <div
      role="status"
      className={cx(
        "pointer-events-auto flex min-h-12 items-center gap-2.5 rounded-card px-4 py-2.5 text-[15px] font-semibold shadow-lg",
        t.tone === "error" ? "bg-peligro text-white" : "bg-texto text-fondo",
      )}
    >
      <Icon size={20} aria-hidden className={t.tone === "error" ? "" : "text-acento"} />
      <span className="flex-1">{t.text}</span>
      {t.action && (
        <button
          type="button"
          onClick={() => {
            t.action?.run();
            dismissToast(t.id);
          }}
          className="h-9 rounded-lg px-3 text-sm font-semibold text-acento"
        >
          {t.action.label}
        </button>
      )}
    </div>
  );
}

export function Toaster() {
  const list = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[96px] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      {list.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}
