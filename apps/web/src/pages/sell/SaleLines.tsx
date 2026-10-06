import { type CartLine, formatMoney, formatQty, lineAmount } from "@mostrador/shared";
import { CircleAlert, Minus, Plus, Trash2 } from "lucide-react";
import { cx } from "../../ui/cx";

export type LineWarning = { lineId: string; text: string };

// Tailwind necesita ver las clases completas en el código: no armarlas por partes.
const COLS = "grid-cols-[minmax(0,1fr)_136px_100px_110px_36px]";
const STEP =
  "inline-flex size-8 items-center justify-center rounded-md border border-borde text-texto-suave hover:bg-fondo hover:text-texto";

/** Líneas del ticket en la Mac: producto, cantidad con − / +, unitario, subtotal y quitar (44 px). */
export function SaleTable({
  lines,
  selected,
  onSelect,
  warnings,
  onDismissWarning,
  onQty,
  onRemove,
}: {
  lines: CartLine[];
  selected: string | null;
  onSelect: (id: string) => void;
  warnings: LineWarning[];
  onDismissWarning: (lineId: string) => void;
  onQty: (lineId: string, dir: 1 | -1) => void;
  onRemove: (lineId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-borde bg-superficie">
      <div
        className={`grid h-8 ${COLS} items-center gap-2 border-b border-borde bg-fondo pr-1.5 pl-3.5 text-xs font-semibold text-texto-suave`}
      >
        <span>Producto</span>
        <span className="text-right">Cantidad</span>
        <span className="text-right">Unitario</span>
        <span className="text-right">Subtotal</span>
        <span className="sr-only">Quitar</span>
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
              <div
                className={cx(
                  `grid h-11 w-full ${COLS} items-center gap-2 border-b border-borde pr-1.5 pl-3.5 text-[15px]`,
                  l.id === selected && "bg-primario-suave shadow-[inset_3px_0_0_var(--primario)]",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(l.id)}
                  className={cx("h-full truncate text-left", l.id === selected && "font-semibold")}
                >
                  {l.description}
                  {l.discountCents > 0 && (
                    <span className="ml-2 text-xs font-semibold text-exito">
                      −{formatMoney(l.discountCents)}
                    </span>
                  )}
                </button>
                {l.kind === "promo" ? (
                  <span className="tnum text-right">{formatQty(l.qty, l.unit)}</span>
                ) : (
                  <span className="inline-flex items-center justify-end gap-1">
                    <button
                      type="button"
                      aria-label={`Restar ${l.description}`}
                      onClick={() => onQty(l.id, -1)}
                      className={STEP}
                    >
                      <Minus size={16} />
                    </button>
                    <span className="tnum min-w-12 text-center">{formatQty(l.qty, l.unit)}</span>
                    <button
                      type="button"
                      aria-label={`Sumar ${l.description}`}
                      onClick={() => onQty(l.id, 1)}
                      className={STEP}
                    >
                      <Plus size={16} />
                    </button>
                  </span>
                )}
                <span className="tnum text-right text-texto-suave">
                  {formatMoney(l.unitPriceCents)}
                </span>
                <span className="tnum text-right font-semibold">{formatMoney(lineAmount(l))}</span>
                {l.kind === "promo" ? (
                  <span />
                ) : (
                  <button
                    type="button"
                    aria-label={`Quitar ${l.description}`}
                    onClick={() => onRemove(l.id)}
                    className="inline-flex size-8 items-center justify-center rounded-md text-texto-suave hover:bg-peligro-suave hover:text-peligro"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
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
