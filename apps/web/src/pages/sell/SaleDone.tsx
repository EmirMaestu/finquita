import { formatMoney, saleNumberLabel } from "@mostrador/shared";
import { Check } from "lucide-react";
import { useEffect } from "react";

/** Venta lista: confirmación grande dos segundos; vuelve sola o con cualquier tecla. */
export function SaleDone({
  number,
  totalCents,
  changeCents,
  method,
  onDone,
  ms = 2000,
}: {
  number: number;
  totalCents: number;
  changeCents: number;
  method: string;
  onDone: () => void;
  ms?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, ms);
    const k = (e: KeyboardEvent) => {
      e.preventDefault();
      onDone();
    };
    const timer = setTimeout(() => window.addEventListener("keydown", k, { once: true }), 150);
    return () => {
      clearTimeout(t);
      clearTimeout(timer);
      window.removeEventListener("keydown", k);
    };
  }, [onDone, ms]);
  return (
    <button
      type="button"
      onClick={onDone}
      aria-label="Venta lista"
      className="fixed inset-0 z-[55] flex flex-col items-center justify-center gap-4 bg-primario px-6 text-center text-sobre-primario"
    >
      <span className="inline-flex size-22 items-center justify-center rounded-full bg-white/20">
        <Check size={48} strokeWidth={3} aria-hidden />
      </span>
      <span className="text-xl opacity-90 lg:text-[22px]">
        {saleNumberLabel(number)} · {formatMoney(totalCents)} · {method}
      </span>
      <span className="tnum text-5xl leading-none font-semibold tracking-[-.03em] lg:text-8xl">
        {changeCents > 0 ? `Vuelto ${formatMoney(changeCents)}` : "Listo"}
      </span>
      <span className="mt-10 text-sm opacity-75">Cualquier tecla para la próxima venta</span>
    </button>
  );
}
