import { type AlertMatrix, DEFAULT_ALERTS } from "./alerts";
/** Ajustes con sus valores por defecto (modo simple). */

export type Features = {
  promotions: boolean;
  lots: boolean;
  counts: boolean;
  multiRegister: boolean;
};

export const DEFAULT_FEATURES: Features = {
  promotions: false,
  lots: false,
  counts: false,
  multiRegister: false,
};

export type PricingSettings = {
  /** Redondeo del precio en centavos: 1000 ($ 10), 5000 ($ 50) o 10000 ($ 100). */
  roundingCents: number;
  defaultMarginBp: number;
  /** Ganancia mínima: por debajo, el producto se marca. */
  minMarginBp: number;
  /** Tope de descuento sin PIN, en puntos básicos. */
  discountCapBp: number;
  sellWithoutStock: "warn" | "pin";
  reserveDays: number;
};

export const DEFAULT_PRICING: PricingSettings = {
  roundingCents: 5000,
  defaultMarginBp: 4000,
  minMarginBp: 2000,
  discountCapBp: 1000,
  sellWithoutStock: "warn",
  reserveDays: 2,
};

export type PaymentMethodSettings = {
  enabled: boolean;
  /** Recargo (+) o descuento (−) del medio, en puntos básicos. */
  surchargeBp: number;
  /** Comisión que cobra el medio (para rentabilidad), en puntos básicos. */
  feeBp: number;
};

export type PaymentsSettings = {
  methods: Record<
    "cash" | "debit" | "credit" | "transfer" | "qr" | "account",
    PaymentMethodSettings
  >;
  alias: string;
  cvu: string;
  /** Imagen del QR fijo del local (data URL). */
  qrImage: string | null;
};

export const DEFAULT_PAYMENTS: PaymentsSettings = {
  methods: {
    cash: { enabled: true, surchargeBp: 0, feeBp: 0 },
    debit: { enabled: true, surchargeBp: 0, feeBp: 80 },
    credit: { enabled: true, surchargeBp: 1000, feeBp: 180 },
    transfer: { enabled: true, surchargeBp: 0, feeBp: 0 },
    qr: { enabled: true, surchargeBp: 0, feeBp: 80 },
    account: { enabled: true, surchargeBp: 0, feeBp: 0 },
  },
  alias: "",
  cvu: "",
  qrImage: null,
};

export type TicketSettings = {
  /** Hay impresora térmica conectada a este local. */
  printer: boolean;
  width: 58 | 80;
  header: string;
  footer: string;
  autoPrint: boolean;
  copies: number;
};

export const DEFAULT_TICKETS: TicketSettings = {
  printer: false,
  width: 58,
  header: "",
  footer: "¡Gracias por tu compra!",
  autoPrint: false,
  copies: 1,
};

/** Ajustes > Cajas: conteo ciego y billetes y monedas que se cuentan (en pesos). */
export type CashSettings = { blindCount: boolean; denominations: number[] };

export const DEFAULT_CASH: CashSettings = {
  blindCount: true,
  denominations: [20000, 10000, 2000, 1000, 500, 200, 100, 50, 20, 10],
};

/** Facturación electrónica (fase 2): por ahora, solo "Avisame cuando esté". */
export type InvoicingSettings = { notifyWhenReady: boolean };

export type SettingsMap = {
  features: Features;
  alerts: AlertMatrix;
  cash: CashSettings;
  invoicing: InvoicingSettings;
  pricing: PricingSettings;
  payments: PaymentsSettings;
  tickets: TicketSettings;
};

export const DEFAULT_SETTINGS: SettingsMap = {
  features: DEFAULT_FEATURES,
  alerts: DEFAULT_ALERTS,
  cash: DEFAULT_CASH,
  invoicing: { notifyWhenReady: false },
  pricing: DEFAULT_PRICING,
  payments: DEFAULT_PAYMENTS,
  tickets: DEFAULT_TICKETS,
};

/** Recargo de un medio sobre un monto: crédito +10 % sobre $ 8.550 → $ 855. */
export function surchargeFor(amountCents: number, bp: number): number {
  return Math.round((amountCents * bp) / 10000);
}
