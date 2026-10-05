import { type CartLine, formatMoney, formatQty, lineAmount } from "@mostrador/shared";
import { CircleAlert, Minus, Plus } from "lucide-react";
import { cx } from "../../ui/cx";

export type LineWarning = { lineId: string; text: string };

/** Líneas del ticket en la Mac: producto, cantidad, unitario y subtotal (44 px). */
export function SaleTable({
  lines,
  selected,
  onSelect,
  warnings,
  onDismissWarning,
  onRemove,
}: {
  lines: CartLine[];
  selected: string | null;
  onSelect: (id: string) => void;
  warnings: LineWarning[];
  onDismissWarning: (lineId: string) => void;
  onRemove: (lineId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-borde bg-superficie">
      <div className="grid h-8 grid-cols-[minmax(0,1fr)_110px_110px_110px] items-center gap-2 border-b border-borde bg-fondo px-3.5 text-xs font-semibold text-texto-suave">
        <span>Producto</span>
        <span className="text-right">Cantidad</span>
        <span className="text-right">Unitario</span>
        <span className="text-right">Subtotal</span>
      </div>
      <ul className="m-0 list-none p-0" aria-label="Líneas de la venta">
        {lines.length === 0 && (
          <li className="px-3.5 py-6 text-center text-sm text-texto-suave">
            Escaneá un producto o buscalo por nombre.
          </li>
        )}
        {lines.map((l) => {
          const w = warnings.find((x) => x.lineId === l.id);
          return (
            <li key={l.id} data-selected={l.id === selected || undefined}>
              <button
                type="button"
                onClick={() => onSelect(l.id)}
                className={cx(
                  "grid h-11 w-full grid-cols-[minmax(0,1fr)_110px_110px_110px] items-center gap-2 border-b border-borde px-3.5 text-left text-[15px]",
                  l.id === selected && "bg-primario-suave shadow-[inset_3px_0_0_var(--primario)]",
                )}
              >
                <span className={cx("truncate", l.id === selected && "font-semibold")}>
                  {l.description}
                  {l.discountCents > 0 && (
                    <span className="ml-2 text-xs font-semibold text-exito">
                      −{formatMoney(l.discountCents)}
                    </span>
                  )}
                </span>
                <span className="tnum text-right">{formatQty(l.qty, l.unit)}</span>
                <span className="tnum text-right text-texto-suave">
                  {formatMoney(l.unitPriceCents)}
                </span>
                <span className="tnum text-right font-semibold">{formatMoney(lineAmount(l))}</span>
              </button>
              {w && (
                <div className="flex items-center gap-2.5 border-b border-borde bg-peligro-suave px-3.5 py-2 text-[13px] font-medium text-peligro">
                  <CircleAlert size={16} aria-hidden />
                  <span className="flex-1">{w.text}</span>
                  <button
                    type="button"
                    onClick={() => onDismissWarning(l.id)}
                    className="h-7 rounded-md border border-current px-2.5 font-semibold"
                  >
                    Vender igual
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(l.id)}
                    className="h-7 px-2.5 font-semibold"
                  >
                    Quitar
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex gap-4 px-3.5 py-2 text-xs text-texto-suave">
        <span>↑ ↓ elegir línea</span>
        <span>+ − cantidad</span>
        <span>Supr quitar</span>
        <span>* multiplicar</span>
      </div>
    </div>
  );
}

/** Líneas en el iPhone: stepper − / + y quitar. */
export function SaleList({
  lines,
  onQty,
  onRemove,
  warnings,
}: {
  lines: CartLine[];
  onQty: (id: string, dir: 1 | -1) => void;
  onRemove: (id: string) => void;
  warnings: LineWarning[];
}) {
  return (
    <ul className="m-0 list-none bg-superficie p-0" aria-label="Líneas de la venta">
      {lines.map((l) => {
        const w = warnings.find((x) => x.lineId === l.id);
        return (
          <li key={l.id} className="border-b border-borde">
            <div className="flex min-h-16 items-center gap-2.5 px-4">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-semibold">{l.description}</span>
                <span className="text-[13px] text-texto-suave">
                  {formatQty(l.qty, l.unit)} × {formatMoney(l.unitPriceCents)}
                </span>
              </div>
              {l.unit === "unit" ? (
                <span className="inline-flex items-center overflow-hidden rounded-lg border border-borde">
                  <button
                    type="button"
                    aria-label={`Restar ${l.description}`}
                    onClick={() => onQty(l.id, -1)}
                    className="inline-flex size-11 items-center justify-center"
                  >
                    <Minus size={20} />
                  </button>
                  <span className="tnum w-7 text-center font-semibold">{l.qty}</span>
                  <button
                    type="button"
                    aria-label={`Sumar ${l.description}`}
                    onClick={() => onQty(l.id, 1)}
                    className="inline-flex size-11 items-center justify-center"
                  >
                    <Plus size={20} />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onRemove(l.id)}
                  className="h-11 rounded-lg px-2 text-sm font-semibold text-peligro"
                >
                  Quitar
                </button>
              )}
              <span className="tnum min-w-16 text-right font-semibold">
                {formatMoney(lineAmount(l))}
              </span>
            </div>
            {w && (
              <div className="bg-peligro-suave px-4 py-2 text-[13px] font-medium text-peligro">
                {w.text}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
