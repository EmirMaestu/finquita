import { formatMoney } from "@mostrador/shared";
import { ScanBarcode } from "lucide-react";
import { forwardRef } from "react";
import type { LocalProduct } from "../../data/types";
import { cx } from "../../ui/cx";

type Props = {
  value: string;
  onChange: (v: string) => void;
  results: LocalProduct[];
  active: number;
  onPick: (p: LocalProduct) => void;
  multiplier: number | null;
  big?: boolean;
  onCamera?: () => void;
};

/** Buscador de Vender: la pistola escanea sin tocarlo; por nombre muestra resultados. */
export const SearchBox = forwardRef<HTMLInputElement, Props>(function SearchBox(
  { value, onChange, results, active, onPick, multiplier, big, onCamera },
  ref,
) {
  return (
    <div className="relative flex-1">
      <label
        className={cx(
          "flex items-center gap-3 rounded-lg border-2 border-primario bg-superficie px-3.5 shadow-[0_0_0_3px_var(--primario-suave)]",
          big ? "h-12" : "h-12",
        )}
      >
        <ScanBarcode size={24} className="shrink-0 text-primario" aria-hidden />
        {multiplier && (
          <span className="rounded bg-acento-suave px-2 py-0.5 text-sm font-semibold">
            × {multiplier}
          </span>
        )}
        <input
          ref={ref}
          aria-label="Escaneá o buscá por nombre"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Escaneá o buscá por nombre"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-base text-texto outline-none placeholder:text-texto-suave"
        />
        {onCamera ? (
          <button
            type="button"
            aria-label="Escanear con la cámara"
            onClick={onCamera}
            className="-mr-2 inline-flex size-11 items-center justify-center rounded-lg bg-primario text-sobre-primario"
          >
            <ScanBarcode size={22} />
          </button>
        ) : (
          <kbd className="rounded border border-borde px-1.5 py-0.5 text-[11px] font-semibold text-texto-suave">
            F2
          </kbd>
        )}
      </label>
      {results.length > 0 && (
        <ul
          aria-label="Resultados"
          className="absolute inset-x-0 top-14 z-30 m-0 list-none overflow-hidden rounded-card border border-borde bg-superficie p-1 shadow-lg"
        >
          {results.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(p)}
                aria-current={i === active || undefined}
                className={cx(
                  "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left",
                  i === active ? "bg-primario-suave" : "hover:bg-neutro-suave",
                )}
              >
                <span className="flex-1 truncate font-medium">{p.name}</span>
                <span className="tnum font-semibold">
                  {formatMoney(p.priceCents)}
                  {p.saleUnit === "kg" ? " / kg" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
