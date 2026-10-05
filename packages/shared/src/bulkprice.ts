/** Cambio masivo de precios: % al precio, % al costo o recalcular desde el costo, con redondeo. */
import { marginOnCostBp, priceFromMargin, roundPrice } from "./pricing";

export type BulkMode = "price_pct" | "cost_pct" | "recalc";

export type BulkInput = {
  id: string;
  name: string;
  priceCents: number;
  costCents: number | null;
  marginBp: number | null;
  fixedPrice: boolean;
  /** Ganancia por defecto de su categoría (para recalcular a los que no tienen una propia). */
  categoryMarginBp?: number | null;
};

export type BulkRow = {
  id: string;
  name: string;
  beforeCents: number;
  afterCents: number;
  costBeforeCents: number | null;
  costAfterCents: number | null;
  /** Ganancia sobre costo con el precio nuevo. */
  marginAfterBp: number | null;
  /** Por qué no cambia (precio fijo, sin costo). */
  skipped: string | null;
};

export function bulkPreview(
  items: BulkInput[],
  a: { mode: BulkMode; percentBp?: number; roundingCents: number; defaultMarginBp?: number },
): BulkRow[] {
  const pct = a.percentBp ?? 0;
  return items.map((p) => {
    const base = {
      id: p.id,
      name: p.name,
      beforeCents: p.priceCents,
      costBeforeCents: p.costCents,
    };
    if (p.fixedPrice) {
      return {
        ...base,
        afterCents: p.priceCents,
        costAfterCents: p.costCents,
        marginAfterBp: p.costCents ? marginOnCostBp(p.costCents, p.priceCents) : null,
        skipped: "Precio fijo",
      };
    }
    if (a.mode === "price_pct") {
      const after = roundPrice((p.priceCents * (10000 + pct)) / 10000, a.roundingCents);
      return {
        ...base,
        afterCents: after,
        costAfterCents: p.costCents,
        marginAfterBp: p.costCents ? marginOnCostBp(p.costCents, after) : null,
        skipped: null,
      };
    }
    if (!p.costCents) {
      return {
        ...base,
        afterCents: p.priceCents,
        costAfterCents: p.costCents,
        marginAfterBp: null,
        skipped: "Sin costo",
      };
    }
    const cost =
      a.mode === "cost_pct" ? Math.round((p.costCents * (10000 + pct)) / 10000) : p.costCents;
    const margin = p.marginBp ?? p.categoryMarginBp ?? a.defaultMarginBp ?? 4000;
    const after = priceFromMargin(cost, margin, a.roundingCents);
    return {
      ...base,
      afterCents: after,
      costAfterCents: cost,
      marginAfterBp: marginOnCostBp(cost, after),
      skipped: null,
    };
  });
}

/** Resumen de la vista previa: cuántos cambian y el aumento promedio. */
export function bulkSummary(rows: BulkRow[]): {
  changed: number;
  skipped: number;
  avgChangeBp: number;
} {
  const changed = rows.filter((r) => !r.skipped && r.afterCents !== r.beforeCents);
  const avg = changed.length
    ? changed.reduce((s, r) => s + (r.afterCents / r.beforeCents - 1), 0) / changed.length
    : 0;
  return {
    changed: changed.length,
    skipped: rows.filter((r) => r.skipped).length,
    avgChangeBp: Math.round(avg * 10000),
  };
}
