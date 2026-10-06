import type { DecodeHintType as HintType } from "@zxing/library";
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
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all(
          [import("@zxing/browser"), import("@zxing/library")],
        );
        // Solo los formatos de productos (EAN/UPC en el almacén) y con más esfuerzo por
        // cuadro: buscar todos los formatos hacía que los códigos chicos no se leyeran nunca.
        const hints = new Map<HintType, unknown>([
          [
            DecodeHintType.POSSIBLE_FORMATS,
            [
              BarcodeFormat.EAN_13,
              BarcodeFormat.EAN_8,
              BarcodeFormat.UPC_A,
              BarcodeFormat.UPC_E,
              BarcodeFormat.CODE_128,
              BarcodeFormat.ITF,
            ],
          ],
          [DecodeHintType.TRY_HARDER, true],
        ]);
        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 100,
        });
        const el = video.current;
        if (!el || cancelled) return;
        // Por defecto el iPhone da 640×480: con eso las barras de una lata no se distinguen.
        // Se pide HD y foco continuo (donde el navegador lo permita; si no, se ignora).
        const constraints = {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
          },
        } satisfies MediaStreamConstraints;
        const controls = await reader.decodeFromConstraints(constraints, el, (result) => {
          const text = result?.getText();
          if (text && accept(text)) cb.current(text);
        });
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
