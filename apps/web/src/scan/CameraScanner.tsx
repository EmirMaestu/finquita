import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createRepeatFilter } from "./camera";

/**
 * Lector por cámara con @zxing/browser (Safari no trae lector nativo).
 * Escanea en continuo; el que lo usa decide qué hacer con cada código.
 */
export function CameraScanner({
  onCode,
  onClose,
  hint,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
  hint?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const cb = useRef(onCode);
  cb.current = onCode;

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    const accept = createRepeatFilter();
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const el = video.current;
        if (!el || cancelled) return;
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          el,
          (result) => {
            const text = result?.getText();
            if (text && accept(text)) cb.current(text);
          },
        );
        stop = () => controls.stop();
        if (cancelled) stop();
      } catch {
        setError("No pudimos abrir la cámara. Revisá el permiso en Ajustes del teléfono.");
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 text-white">
        <span className="text-base font-semibold">{hint ?? "Apuntá al código de barras"}</span>
        <button
          type="button"
          aria-label="Cerrar cámara"
          onClick={onClose}
          className="inline-flex size-12 items-center justify-center"
        >
          <X size={26} />
        </button>
      </div>
      <div className="relative flex-1">
        <video ref={video} className="absolute inset-0 size-full object-cover" playsInline muted />
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 h-40 w-72 -translate-x-1/2 -translate-y-1/2 rounded-card border-4 border-acento"
        />
        {error && (
          <div className="absolute inset-x-4 bottom-8 rounded-card bg-peligro p-4 text-center font-semibold text-white">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
