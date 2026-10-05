/** Reportes: períodos, comparación y la forma común (respuesta, gráfico y tabla). */
import { addDays, type DateStr, diffDays } from "./dates";

export type PeriodPreset = "today" | "yesterday" | "7d" | "month" | "last_month" | "custom";

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  "7d": "7 días",
  month: "Este mes",
  last_month: "Mes anterior",
  custom: "A medida",
};

/** Rango inclusivo de fechas (día argentino). */
export type Range = { from: DateStr; to: DateStr };

const monthStart = (d: DateStr) => `${d.slice(0, 7)}-01`;
function monthEnd(d: DateStr): DateStr {
  const [y, m] = d.split("-").map(Number);
  const last = new Date(Date.UTC(y ?? 2026, m ?? 1, 0)).getUTCDate();
  return `${d.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export function periodRange(p: PeriodPreset, today: DateStr, custom?: Range): Range {
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "month":
      return { from: monthStart(today), to: today };
    case "last_month": {
      const end = addDays(monthStart(today), -1);
      return { from: monthStart(end), to: end };
    }
    case "custom":
      return custom ?? { from: today, to: today };
  }
}

/**
 * El período anterior para comparar: el mismo largo, justo antes. Un mes (o parte) se compara
 * con el mismo tramo del mes anterior: del 1 al 5 de octubre contra del 1 al 5 de septiembre.
 */
export function previousRange(r: Range): Range {
  if (r.from.endsWith("-01")) {
    const prevStart = monthStart(addDays(r.from, -1));
    const len = diffDays(r.from, r.to);
    const to = addDays(prevStart, len);
    const end = monthEnd(prevStart);
    return { from: prevStart, to: to > end ? end : to };
  }
  const len = diffDays(r.from, r.to) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}

export const daysIn = (r: Range) => diffDays(r.from, r.to) + 1;

/** Días del mes de una fecha (para prorratear los gastos fijos). */
export function daysInMonth(d: DateStr): number {
  return Number(monthEnd(d).slice(8));
}

/** Gasto fijo mensual que cae en el rango, prorrateado por día. */
export function fixedInRange(monthlyCents: number, r: Range): number {
  let total = 0;
  let d = r.from;
  while (d <= r.to) {
    total += monthlyCents / daysInMonth(d);
    d = addDays(d, 1);
  }
  return Math.round(total);
}

export type AgingBucket = "0-30" | "31-60" | "60+";
export const agingBucket = (days: number): AgingBucket =>
  days <= 30 ? "0-30" : days <= 60 ? "31-60" : "60+";

export type ReportCell = string | number | null;
export type ReportColumn = {
  key: string;
  label: string;
  kind?: "money" | "qty" | "percent" | "int" | "text" | "date";
};

/** Lo que devuelve cada reporte: la respuesta, el gráfico y el detalle. */
export type Report = {
  question: string;
  headline: {
    label: string;
    value: number;
    kind: "money" | "int" | "percent";
    previous?: number | null;
    deltaBp?: number | null;
    hint?: string;
  };
  /** Números secundarios al lado de la respuesta. */
  stats?: { label: string; value: number; kind: "money" | "int" | "percent" | "qty" }[];
  chart?: {
    kind: "bars" | "heatmap";
    label: string;
    points: { label: string; value: number; previous?: number }[];
    grid?: number[][];
  };
  tables: {
    key: string;
    title: string;
    columns: ReportColumn[];
    rows: Record<string, ReportCell>[];
    drill?: { column: string; param: string };
  }[];
};

export const deltaBp = (now: number, before: number | null | undefined) =>
  before ? Math.round(((now - before) / Math.abs(before)) * 10000) : null;
