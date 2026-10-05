/** Avisos: tipos, a dónde llevan y la matriz tipo × canal × rol (Ajustes > Avisos). */
import type { Role } from "./permissions";

export const ALERT_KINDS = [
  "low_stock",
  "expiry",
  "cash_difference",
  "shift_closed",
  "order_confirmed",
  "order_no_response",
  "invoice_due",
  "credit_overdue",
  "sale_voided",
  "negative_stock",
  "adjustment_pending",
  "receipt_costs",
  "credit_over_limit",
  "sync_rejected",
  "duplicate_barcode",
  "shift_mismatch",
  "clock_skew",
] as const;

export type AlertKindCode = (typeof ALERT_KINDS)[number];

export const ALERT_LABEL: Record<AlertKindCode, string> = {
  low_stock: "Stock bajo",
  expiry: "Vencimientos",
  cash_difference: "Diferencia de caja al cerrar",
  shift_closed: "Cierre de turno",
  order_confirmed: "Pedido confirmado",
  order_no_response: "Pedido sin respuesta",
  invoice_due: "Factura de proveedor por vencer",
  credit_overdue: "Fiado vencido",
  sale_voided: "Venta anulada",
  negative_stock: "Stock negativo",
  adjustment_pending: "Ajustes por aprobar",
  receipt_costs: "Recepción para completar costos",
  credit_over_limit: "Fiado sobre el límite",
  sync_rejected: "Operación rechazada al sincronizar",
  duplicate_barcode: "Código repetido",
  shift_mismatch: "Turno que no coincide",
  clock_skew: "Hora del dispositivo corrida",
};

export type AlertChannel = "app" | "push";
export type AlertMatrix = Record<AlertKindCode, Record<AlertChannel, Role[]>>;

const all: Role[] = ["owner", "manager", "cashier", "stocker"];
const row = (app: Role[], push: Role[]) => ({ app, push });

/** Por defecto: el dueño ve todo y recibe push de lo urgente; cada rol, lo suyo. */
export const DEFAULT_ALERTS: AlertMatrix = {
  low_stock: row(["owner", "manager", "stocker"], []),
  expiry: row(["owner", "manager", "stocker"], ["owner"]),
  cash_difference: row(["owner", "manager"], ["owner"]),
  shift_closed: row(["owner"], []),
  order_confirmed: row(["owner", "manager"], []),
  order_no_response: row(["owner", "manager"], ["owner"]),
  invoice_due: row(["owner"], ["owner"]),
  credit_overdue: row(["owner", "manager"], []),
  sale_voided: row(["owner", "manager"], ["owner"]),
  negative_stock: row(["owner", "manager", "stocker"], ["owner"]),
  adjustment_pending: row(["owner", "manager"], ["owner", "manager"]),
  receipt_costs: row(["owner"], ["owner"]),
  credit_over_limit: row(["owner", "manager"], ["owner"]),
  sync_rejected: row(all, ["owner"]),
  duplicate_barcode: row(["owner", "manager"], []),
  shift_mismatch: row(["owner", "manager"], []),
  clock_skew: row(["owner"], []),
};

/** Si el rol ve (o recibe por push) ese tipo de aviso. */
export function alertFor(
  matrix: Partial<AlertMatrix> | undefined,
  kind: string,
  role: Role,
  channel: AlertChannel = "app",
): boolean {
  const r = (matrix?.[kind as AlertKindCode] ?? DEFAULT_ALERTS[kind as AlertKindCode])?.[channel];
  return r ? r.includes(role) : role === "owner" && channel === "app";
}

/** La pantalla a la que lleva cada aviso. */
export function alertPath(a: {
  kind: string;
  refType: string | null;
  refId: string | null;
}): string {
  switch (a.refType) {
    case "product":
      return a.refId ? `/productos/${a.refId}` : "/productos";
    case "purchase_order":
      return a.refId ? `/compras/pedidos/${a.refId}` : "/compras/pedidos";
    case "supplier_invoice":
      return "/compras/facturas";
    case "customer":
      return a.refId ? `/clientes/${a.refId}` : "/clientes";
    case "receipt":
      return a.refId ? `/compras/recepcion/${a.refId}/costos` : "/compras/recepcion";
    case "shift":
      return "/caja/cierres";
    case "sale":
      return "/vender/historial";
    case "stock_movement":
      return "/productos/movimientos";
    case "lot":
      return "/productos/vencimientos";
  }
  if (a.kind === "low_stock") return "/compras/sugerido";
  return "/avisos";
}
