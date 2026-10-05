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
  roundingCents: 1000,
  defaultMarginBp: 4000,
  minMarginBp: 2000,
  discountCapBp: 1000,
  sellWithoutStock: "warn",
  reserveDays: 2,
};

export type SettingsMap = {
  features: Features;
  pricing: PricingSettings;
};

export const DEFAULT_SETTINGS: SettingsMap = {
  features: DEFAULT_FEATURES,
  pricing: DEFAULT_PRICING,
};
