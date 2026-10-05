import { useCallback, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router";
import { findByCode } from "../data/catalog";
import type { LocalProduct } from "../data/types";
import { toast } from "../ui/toast";
import { beep } from "./beep";
import { CameraScanner } from "./CameraScanner";
import { QuickProduct } from "./QuickProduct";
import { useScanner } from "./useScanner";

/**
 * Lo escaneado fuera de las pantallas que lo usan (Vender, recepción, conteo) muestra
 * la ficha rápida. Las pantallas que escanean registran su propio manejador.
 */
type Handler = (code: string) => void;
let handler: Handler | null = null;
let cameraOpen = false;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export const scanRouter = {
  /** Una pantalla toma los escaneos (devuelve la función para soltarlos). */
  claim(h: Handler): () => void {
    handler = h;
    return () => {
      if (handler === h) handler = null;
    };
  },
  openCamera() {
    cameraOpen = true;
    emit();
  },
  closeCamera() {
    cameraOpen = false;
    emit();
  },
};

function useCameraOpen() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cameraOpen,
    () => cameraOpen,
  );
}

export function GlobalScan() {
  const [quick, setQuick] = useState<LocalProduct | null>(null);
  const camera = useCameraOpen();
  const { pathname } = useLocation();

  const onCode = useCallback(async (code: string) => {
    if (handler) return handler(code);
    const p = await findByCode(code);
    if (!p) {
      beep("error");
      toast({ text: `El código ${code} no está cargado`, tone: "error" });
      return;
    }
    beep("ok");
    scanRouter.closeCamera();
    setQuick(p);
  }, []);

  useScanner({ onScan: (c) => void onCode(c) });

  return (
    <>
      {camera && (
        <CameraScanner
          key={pathname}
          onCode={(c) => void onCode(c)}
          onClose={() => scanRouter.closeCamera()}
        />
      )}
      {quick && <QuickProduct product={quick} onClose={() => setQuick(null)} />}
    </>
  );
}
