import { useRegisterSW } from "virtual:pwa-register/react";
import { useCallback } from "react";
import { useSaleInProgress } from "../lib/saleActivity";
import { UpdateBanner } from "../ui/UpdateBanner";

/** Registra el service worker y muestra el aviso de versión nueva. */
export function PwaUpdater() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Busca versiones nuevas cada hora; la Mac del mostrador queda siempre abierta.
      if (registration) setInterval(() => registration.update(), 60 * 60 * 1000);
    },
  });
  const saleInProgress = useSaleInProgress();
  const onUpdate = useCallback(() => {
    void updateServiceWorker(true);
  }, [updateServiceWorker]);
  return (
    <UpdateBanner needRefresh={needRefresh} saleInProgress={saleInProgress} onUpdate={onUpdate} />
  );
}
