import { z } from "zod";
import { formatMoney } from "./money";
import { OP_PAYLOADS, type OpType } from "./sync";

/**
 * Errores de validación en el idioma del mostrador. Los esquemas de Zod son la fuente de
 * verdad (los usan la API y la app); acá se traduce cada problema a "Campo: qué corregir".
 */

/** Nombre de cada campo como lo ve la persona (por el último tramo de la ruta). */
export const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  nickname: "Apodo",
  phone: "Teléfono",
  email: "Email",
  whatsapp: "WhatsApp",
  cuit: "CUIT",
  address: "Dirección",
  city: "Localidad",
  hours: "Horario",
  note: "Comentario",
  notes: "Notas",
  reason: "Motivo",
  description: "Descripción",
  category: "Categoría",
  categoryId: "Categoría",
  contact: "Contacto",
  rubro: "Rubro",
  sector: "Rubro",
  openingFloatCents: "Fondo inicial",
  countedCashCents: "Efectivo contado",
  leftFloatCents: "Fondo que queda",
  withdrawnCents: "Retiro",
  amountCents: "Monto",
  discountCents: "Descuento",
  surchargeCents: "Recargo",
  totalCents: "Total",
  subtotalCents: "Subtotal",
  changeCents: "Vuelto",
  priceCents: "Precio",
  costCents: "Costo",
  unitCostCents: "Costo por unidad",
  newPriceCents: "Precio nuevo",
  creditLimitCents: "Límite de fiado",
  minimumOrderCents: "Pedido mínimo",
  toleranceCents: "Tolerancia",
  floatCents: "Fondo",
  surchargeBp: "Recargo",
  feeBp: "Comisión",
  marginBp: "Ganancia",
  qty: "Cantidad",
  realQty: "Stock real",
  damagedQty: "Dañados",
  minStock: "Stock mínimo",
  stockQty: "Stock",
  initialStock: "Stock inicial",
  code: "Código",
  minOrderCents: "Pedido mínimo",
  leadDays: "Días de entrega",
  paymentTermsDays: "Plazo de pago",
  legalName: "Razón social",
  contactName: "Contacto",
  dni: "DNI",
  countedQty: "Cantidad contada",
  defaultMarginBp: "Ganancia por defecto",
  blindCount: "Conteo ciego",
  reserveDays: "Días de reserva",
  discountCapBp: "Tope de descuento",
  barcode: "Código de barras",
  barcodes: "Códigos de barras",
  internalCode: "Código interno",
  supplierCode: "Código del proveedor",
  lines: "Ítems",
  payments: "Pagos",
  customerId: "Cliente",
  supplierId: "Proveedor",
  productId: "Producto",
  shiftId: "Turno",
  registerId: "Caja",
  invoiceId: "Factura",
  pin: "PIN",
  password: "Contraseña",
  alias: "Alias",
  cvu: "CVU",
  header: "Encabezado",
  footer: "Pie",
  lotCode: "Lote",
  expiresOn: "Vencimiento",
  deliveryDays: "Días de entrega",
  paymentTermDays: "Plazo de pago",
  percent: "Porcentaje",
  percentBp: "Porcentaje",
  location: "Ubicación",
  denominations: "Billetes",
};

export function fieldLabel(path: readonly PropertyKey[]): string {
  const parts = path.filter((p): p is string => typeof p === "string");
  const last = parts[parts.length - 1];
  const label = last ? FIELD_LABELS[last] : undefined;
  if (label) {
    // "lines.0.description" → "Ítem 1 · Descripción"
    const idx = path.findIndex((p) => typeof p === "number");
    if (idx > 0 && idx < path.length - 1) {
      const parent = FIELD_LABELS[String(path[idx - 1])];
      if (parent) return `${parent.replace(/s$/, "")} ${Number(path[idx]) + 1} · ${label}`;
    }
    return label;
  }
  return last ?? "Datos";
}

type Issue = z.core.$ZodIssue;

const isMoney = (path: readonly PropertyKey[]) => /Cents$/.test(String(path[path.length - 1]));

/** Qué corregir, en palabras: "como mucho 60 caracteres", "tiene que ser $ 0 o más". */
export function issueText(issue: Issue): string {
  const money = isMoney(issue.path);
  switch (issue.code) {
    case "too_small": {
      const min = Number(issue.minimum);
      if (issue.origin === "string")
        return min <= 1 ? "no puede quedar vacío" : `tiene que tener al menos ${min} caracteres`;
      if (issue.origin === "array")
        return min <= 1 ? "tiene que tener al menos uno" : `al menos ${min}`;
      const bound = issue.inclusive ? min : min + 1;
      if (money)
        return bound <= 0 ? "no puede ser negativo" : `tiene que ser ${formatMoney(bound)} o más`;
      return bound <= 0 && !issue.inclusive
        ? "tiene que ser mayor que 0"
        : `tiene que ser ${bound} o más`;
    }
    case "too_big": {
      const max = Number(issue.maximum);
      if (issue.origin === "string") return `como mucho ${max} caracteres`;
      if (issue.origin === "array") return `como mucho ${max}`;
      if (money) return `no puede pasar de ${formatMoney(max)}`;
      return `no puede pasar de ${max}`;
    }
    case "invalid_type":
      return issue.input === undefined || issue.input === null
        ? "falta"
        : issue.expected === "number"
          ? "tiene que ser un número"
          : "no tiene el formato esperado";
    case "invalid_format":
      if (issue.format === "email") return "no es un email válido";
      if (issue.format === "uuid") return "no es válido";
      if (issue.format === "date") return "tiene que ser una fecha (aaaa-mm-dd)";
      if (issue.format === "regex")
        return /^Invalid/i.test(issue.message) ? "tiene caracteres que no van" : issue.message;
      return "no tiene el formato esperado";
    case "invalid_value":
      return "no es una opción válida";
    case "not_multiple_of":
      return "tiene que ser un número entero";
    case "unrecognized_keys":
      return "tiene datos de más";
    default:
      return issue.message.replace(/^Invalid input:?\s*/i, "") || "no es válido";
  }
}

export type FieldError = { path: string; field: string; message: string };

/** Lista de problemas, uno por campo: { path: "lines.0.description", field: "Ítem 1 · Descripción", message }. */
export function describeIssues(issues: readonly Issue[]): FieldError[] {
  const seen = new Set<string>();
  const out: FieldError[] = [];
  for (const i of issues) {
    const path = i.path.map(String).join(".");
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, field: fieldLabel(i.path), message: issueText(i) });
  }
  return out;
}

/** Una sola línea para un toast: "Comentario: como mucho 500 caracteres". */
export function issuesText(issues: readonly Issue[]): string {
  const list = describeIssues(issues);
  const first = list[0];
  if (!first) return "Revisá los datos.";
  // Todos los problemas de una vez (hasta cuatro): nadie arregla de a uno a ciegas.
  const shown = list.slice(0, 4).map((e) => `${e.field}: ${e.message}`);
  const rest = list.length - shown.length;
  return shown.join(" · ") + (rest > 0 ? ` (y ${rest} más)` : "");
}

/** Un problema al validar antes de encolar: la operación no se guarda ni viaja. */
export class OpValidationError extends Error {
  constructor(
    readonly errors: FieldError[],
    readonly type: OpType,
  ) {
    super(errors[0] ? `${errors[0].field}: ${errors[0].message}` : "Los datos no son válidos.");
    this.name = "OpValidationError";
  }
}

/** Un nombre o texto corto: sin espacios de más y sin < ni > (no es lugar para HTML). */
export function plainText(max: number, min = 1) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), "no puede tener < ni >");
}

/** Valida el payload de una operación con el mismo esquema que usa el servidor. */
export function checkOp(type: OpType, payload: unknown): FieldError[] {
  const schema = OP_PAYLOADS[type] as z.ZodType;
  const r = schema.safeParse(payload);
  return r.success ? [] : describeIssues(r.error.issues);
}

/** Tira OpValidationError si el payload no pasa el esquema (antes de tocar la copia local). */
export function assertOp(type: OpType, payload: unknown): void {
  const errors = checkOp(type, payload);
  if (errors.length) throw new OpValidationError(errors, type);
}
