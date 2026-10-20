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
  barcode:
    /(barra|ean|codigo de barras|código de barras|^ean13|^cod.? ?barras|^c[oó]d(igo)?\.?$|^upc$)/i,
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
  /** Sin columna de unidad, se dedujo "por kilo" del nombre ("Jamón cocido x kg"). */
  unitGuessed: boolean;
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
  else if (name.length > 120) errors.push("El nombre es muy largo (hasta 120 letras)");
  else if (/[<>]/.test(name)) errors.push("El nombre no puede tener < ni >");
  const rawPrice = get("price");
  const priceCents = money(rawPrice);
  if (rawPrice && priceCents === null) errors.push(`El precio "${rawPrice}" no es un número`);
  if (!rawPrice) errors.push("Falta el precio");
  if (priceCents !== null && priceCents < 0) errors.push("El precio no puede ser negativo");
  const rawCost = get("cost");
  const costCents = money(rawCost);
  if (rawCost && costCents === null) errors.push(`El costo "${rawCost}" no es un número`);
  let barcode = get("barcode").replace(/\s/g, "") || null;
  let plu = get("plu") || null;
  // Un código de 1 a 5 números es un PLU (el código corto de los pesables), no un código de
  // barras: si no hay PLU en su columna, va ahí (ronda 3: "El código 1001 no es válido").
  if (barcode && /^\d{1,5}$/.test(barcode) && (!plu || plu === barcode)) {
    plu = barcode;
    barcode = null;
  }
  if (barcode && !/^\d{6,14}$/.test(barcode))
    errors.push(
      `El código "${barcode}" no es un código de barras (van de 6 a 14 números). Si es un PLU, ponelo en la columna "Código interno o PLU".`,
    );
  const rawStock = get("stock");
  const stock = quantity(rawStock);
  if (rawStock && stock === null) errors.push(`El stock "${rawStock}" no es un número`);
  if (stock !== null && stock < 0) errors.push("El stock no puede ser negativo");
  const rawMin = get("minStock");
  const minStock = quantity(rawMin);
  const unitCell = get("unit").toLowerCase();
  // "Jamón cocido x kg", "Pan por kilo": si no hay columna de unidad, el nombre lo dice.
  // "Jamón x kg" o "Pan por kilo" sí; "Yerba 1 kg" o "Azúcar 1 kg" no (es el envase).
  const kgByName = /(\bx\s*kg\b|\bpor\s*kilo\b|\bpor\s*kg\b|\bal\s*kilo\b)/i.test(name);
  const unit = /kg|kilo|pes/.test(unitCell) ? "kg" : !unitCell && kgByName ? "kg" : "unit";
  // Lo que se vende por unidad no tiene medias unidades (ronda 3: stock 2,5 de un paquete).
  if (unit === "unit" && stock !== null && !Number.isInteger(stock))
    errors.push(
      `El stock "${rawStock}" tiene decimales y se vende por unidad: poné un número entero`,
    );
  return {
    line,
    name,
    barcode,
    plu,
    priceCents,
    costCents,
    category: get("category") || null,
    stock,
    minStock,
    supplier: get("supplier") || null,
    unit,
    unitGuessed: !unitCell && kgByName,
    errors,
  };
}

/** Filas del archivo a filas normalizadas (la primera es el encabezado). */
export function normalizeSheet(rows: string[][], mapping: ColumnMapping): ImportRow[] {
  return rows.slice(1).map((r, i) => normalizeRow(r, mapping, i + 2));
}
