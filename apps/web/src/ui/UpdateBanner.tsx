import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  /** El service worker tiene una versión nueva esperando. */
  needRefresh: boolean;
  /** Hay una venta en curso: no se muestra nada ni se recarga. */
  saleInProgress: boolean;
  onUpdate: () => void;
};

/**
 * Aviso "Hay una versión nueva". Nunca interrumpe una venta: mientras hay una en curso
 * queda oculto, y si se pidió actualizar, se aplica recién cuando la venta termina.
 */
export function UpdateBanner({ needRefresh, saleInProgress, onUpdate }: Props) {
  const [requested, setRequested] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (requested && needRefresh && !saleInProgress) onUpdate();
  }, [requested, needRefresh, saleInProgress, onUpdate]);

  if (!needRefresh || dismissed || saleInProgress || requested) return null;

  return (
    <div
      role="status"
      className="fixed right-4 bottom-[100px] left-4 z-50 flex items-center gap-3 rounded-card border border-borde bg-superficie p-3 shadow-lg sm:left-auto sm:w-[360px] lg:bottom-4"
    >
      <RefreshCw size={20} aria-hidden className="shrink-0 text-info" />
      <div className="flex-1 text-sm">
        <div className="font-semibold">Hay una versión nueva</div>
        <div className="text-[13px] text-texto-suave">Se instala en un segundo.</div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="h-10 rounded-lg px-3 text-sm font-semibold text-texto-suave hover:bg-neutro-suave"
      >
        Después
      </button>
      <button
        type="button"
        onClick={() => setRequested(true)}
        className="h-10 rounded-lg bg-primario px-4 text-sm font-semibold text-sobre-primario hover:bg-primario-hover"
      >
        Actualizar
      </button>
    </div>
  );
}
