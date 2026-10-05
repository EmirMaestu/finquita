import { formatMoney } from "@mostrador/shared";
import type { LocalProduct } from "../../data/types";
import { cx } from "../../ui/cx";

/** Botones con foto de lo que no tiene código: pan, fiambres, quesos, verdura, huevos sueltos. */
export function QuickButtons({
  products,
  onPick,
  row,
}: {
  products: LocalProduct[];
  onPick: (p: LocalProduct) => void;
  row?: boolean;
}) {
  if (!products.length) return null;
  return (
    <div
      className={cx(
        row ? "flex gap-2 overflow-x-auto px-4" : "grid grid-cols-6 gap-2 2xl:grid-cols-8",
      )}
    >
      {products.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onPick(p)}
          className={cx(
            "flex flex-col overflow-hidden rounded-card border border-borde bg-superficie text-left hover:border-primario",
            row && "w-26 shrink-0",
          )}
        >
          <span
            aria-hidden
            className="h-12 bg-[repeating-linear-gradient(135deg,var(--neutro-suave)_0_6px,var(--borde)_6px_12px)]"
          />
          <span className="flex flex-col gap-0.5 px-2.5 py-2">
            <span className="truncate text-[13px] leading-tight font-semibold">{p.name}</span>
            <span className="text-xs text-texto-suave">
              {formatMoney(p.priceCents)}
              {p.saleUnit === "kg" ? " / kg" : ""}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
