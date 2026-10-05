/** Importar productos desde Excel o CSV: relacionar columnas y validar cada fila. */
import { parseMoney } from "./money";
import { roundQty } from "./qty";

export const IMPORT_FIELDS = {
  name: "Nombre",
  barcode: "Código de barras",
  plu: "Código interno o PLU",
  price: "Precio",
  cost: "Costo",
  category: "Categoría",
  stock: "Stock",
  minStock: "Stock mínimo",
  supplier: "Proveedor",
  unit: "Unidad (u o kg)",
} as const;

export type ImportField = keyof typeof IMPORT_FIELDS;
/** Columna del archivo (índice) para cada campo. */
export type ColumnMapping = Partial<Record<ImportField, number>>;

const HINTS: Record<ImportField, RegExp> = {
  name: /^(nombre|producto|descrip|articulo|artículo|detalle)/i,
  barcode: /(barra|ean|codigo de barras|código de barras|^ean13|^cod.? ?barras)/i,
  plu: /(plu|interno|cod.? ?int)/i,
  price: /(precio|venta|pvp)/i,
  cost: /(costo|compra)/i,
  category: /(categor|rubro|familia)/i,
  stock: /^(stock|existencia|cantidad)$/i,
  minStock: /(m[ií]nimo)/i,
  supplier: /(proveedor|distribuidor)/i,
  unit: /^(unidad|u\.? ?medida|pesable)/i,
};

/** Propone qué columna es cada campo, por el encabezado. */
export function guessMapping(headers: string[]): ColumnMapping {
  const m: ColumnMapping = {};
  const used = new Set<number>();
  const order: ImportField[] = [
    "barcode",
    "plu",
    "minStock",
    "cost",
    "price",
    "name",
    "category",
    "stock",
    "supplier",
    "unit",
  ];
  for (const f of order) {
    const idx = headers.findIndex((h, i) => !used.has(i) && HINTS[f].test(h.trim()));
    if (idx >= 0) {
      m[f] = idx;
      used.add(idx);
    }
  }
  return m;
}

export type ImportRow = {
  line: number;
  name: string;
  barcode: string | null;
  plu: string | null;
  priceCents: number | null;
  costCents: number | null;
  category: string | null;
  stock: number | null;
  minStock: number | null;
  supplier: string | null;
  unit: "unit" | "kg";
  errors: string[];
};

/** Número de una celda: "6.900", "6900,50", "6900.5" (Excel), "$ 1.234". */
function money(cell: string): number | null {
  const s = cell.trim();
  if (!s) return null;
  // Excel guarda los números con punto decimal: 6900.5
  if (/^-?\d+\.\d{1,2}$/.test(s)) return Math.round(Number(s) * 100);
  return parseMoney(s);
}

function quantity(cell: string): number | null {
  const s = cell.trim().replace(/\s*(u|kg|un)\.?$/i, "");
  if (!s) return null;
  const n = /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? roundQty(n) : null;
}

/** Normaliza una fila con la relación de columnas; anota los errores en castellano. */
export function normalizeRow(cells: string[], mapping: ColumnMapping, line: number): ImportRow {
  const get = (f: ImportField) => {
    const i = mapping[f];
    return i === undefined ? "" : (cells[i] ?? "").trim();
  };
  const errors: string[] = [];
  const name = get("name");
  if (!name) errors.push("Falta el nombre");
  const rawPrice = get("price");
  const priceCents = money(rawPrice);
  if (rawPrice && priceCents === null) errors.push(`El precio "${rawPrice}" no es un número`);
  if (!rawPrice) errors.push("Falta el precio");
  if (priceCents !== null && priceCents < 0) errors.push("El precio no puede ser negativo");
  const rawCost = get("cost");
  const costCents = money(rawCost);
  if (rawCost && costCents === null) errors.push(`El costo "${rawCost}" no es un número`);
  const barcode = get("barcode").replace(/\s/g, "") || null;
  if (barcode && !/^\d{6,14}$/.test(barcode)) errors.push(`El código "${barcode}" no es válido`);
  const rawStock = get("stock");
  const stock = quantity(rawStock);
  if (rawStock && stock === null) errors.push(`El stock "${rawStock}" no es un número`);
  const rawMin = get("minStock");
  const minStock = quantity(rawMin);
  const unitCell = get("unit").toLowerCase();
  return {
    line,
    name,
    barcode,
    plu: get("plu") || null,
    priceCents,
    costCents,
    category: get("category") || null,
    stock,
    minStock,
    supplier: get("supplier") || null,
    unit: /kg|kilo|pes/.test(unitCell) ? "kg" : "unit",
    errors,
  };
}

/** Filas del archivo a filas normalizadas (la primera es el encabezado). */
export function normalizeSheet(rows: string[][], mapping: ColumnMapping): ImportRow[] {
  return rows.slice(1).map((r, i) => normalizeRow(r, mapping, i + 2));
}
