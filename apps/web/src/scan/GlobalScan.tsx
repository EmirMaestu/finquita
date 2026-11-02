import { useCallback, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router";
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
/** De dónde vino el código: la pistola deja escapar su primer dígito al campo; la cámara, no. */
export type ScanSource = "gun" | "camera";
type Handler = (code: string, from?: ScanSource) => void;
/** Pila de manejadores: el último que reclamó (la hoja abierta encima) recibe el escaneo. */
const handlers: Handler[] = [];
let handler: Handler | null = null;
let cameraOpen = false;
/** Texto chico dentro del visor ("3 ítems · $ 18.550") y flash de la última lectura. */
let cameraStatus: string | null = null;
let flashAt = 0;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export const scanRouter = {
  /** Una pantalla toma los escaneos (devuelve la función para soltarlos). */
  claim(h: Handler): () => void {
    handlers.push(h);
    handler = h;
    return () => {
      const i = handlers.lastIndexOf(h);
      if (i >= 0) handlers.splice(i, 1);
      handler = handlers[handlers.length - 1] ?? null;
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
  isCameraOpen: () => cameraOpen,
  /** Lo que la pantalla quiere mostrar dentro del visor mientras escanea. */
  setStatus(text: string | null) {
    if (cameraStatus === text) return;
    cameraStatus = text;
    emit();
  },
  /** Una lectura aceptada: el visor parpadea. */
  flash() {
    flashAt = Date.now();
    emit();
  },
};

export function useCameraStatus() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cameraStatus,
    () => cameraStatus,
  );
}
export function useCameraFlash() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => flashAt,
    () => flashAt,
  );
}

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
  const navigate = useNavigate();

  const onCode = useCallback(
    async (code: string, from: ScanSource = "gun") => {
      if (handler) return handler(code, from);
      const p = await findByCode(code);
      if (!p) {
        beep("error");
        // Fuera de Vender, el código nuevo se carga desde acá mismo (Modo carga con el código puesto).
        toast({
          text: `El código ${code} no está cargado`,
          tone: "error",
          ms: 6000,
          action: {
            label: "Cargarlo",
            run: () => {
              scanRouter.closeCamera();
              navigate(`/productos/carga?codigo=${code}`);
            },
          },
        });
        return;
      }
      beep("ok");
      scanRouter.flash();
      scanRouter.closeCamera();
      setQuick(p);
    },
    [navigate],
  );

  useScanner({ onScan: (c) => void onCode(c) });

  return (
    <>
      {camera && (
        <CameraScanner
          key={pathname}
          onCode={(c) => void onCode(c, "camera")}
          onClose={() => scanRouter.closeCamera()}
        />
      )}
      {quick && <QuickProduct product={quick} onClose={() => setQuick(null)} />}
    </>
  );
}
