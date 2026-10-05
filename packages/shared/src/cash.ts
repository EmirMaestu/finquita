/** Caja: efectivo esperado con su cuenta a la vista y resumen por medio de pago. */
import { formatTime } from "./dates";
import { formatMoney } from "./money";
import type { PaymentMethodCode } from "./sync";

export type CashMoveKind =
  | "sale"
  | "refund"
  | "void"
  | "withdrawal"
  | "expense"
  | "income"
  | "credit_payment"
  | "supplier_payment";

export type CashMove = {
  kind: CashMoveKind;
  method: PaymentMethodCode;
  /** Con signo: + entra, − sale. */
  amountCents: number;
  reason?: string | null;
  category?: string | null;
};

export const MOVE_LABEL: Record<CashMoveKind, string> = {
  sale: "Venta",
  refund: "Devolución",
  void: "Anulación",
  withdrawal: "Retiro",
  expense: "Gasto",
  income: "Ingreso",
  credit_payment: "Cobro de fiado",
  supplier_payment: "Pago a proveedor",
};

export const METHOD_LABEL: Record<PaymentMethodCode, string> = {
  cash: "Efectivo",
  debit: "Débito",
  credit: "Crédito",
  qr: "QR o billetera",
  transfer: "Transferencia",
  account: "Fiado",
};

export const EXPENSE_CATEGORIES = {
  cleaning: "Limpieza",
  freight: "Flete",
  maintenance: "Mantenimiento",
  salary_advance: "Adelanto de sueldo",
  other: "Otros",
} as const;

export type ShiftSummary = {
  openingFloatCents: number;
  expectedCashCents: number;
  /** La cuenta del efectivo, renglón por renglón. */
  lines: { label: string; amountCents: number }[];
  /** Por medio de pago: monto y cantidad de operaciones de venta. */
  byMethod: Record<PaymentMethodCode, { amountCents: number; count: number }>;
  salesCents: number;
};

/**
 * Efectivo esperado = fondo inicial + todo lo que entró y salió en efectivo.
 * Los gastos y retiros van uno por uno con su motivo; el resto se agrupa por tipo.
 */
export function summarizeShift(openingFloatCents: number, moves: CashMove[]): ShiftSummary {
  const byMethod = Object.fromEntries(
    (Object.keys(METHOD_LABEL) as PaymentMethodCode[]).map((m) => [
      m,
      { amountCents: 0, count: 0 },
    ]),
  ) as ShiftSummary["byMethod"];
  const grouped = new Map<string, number>();
  const individual: { label: string; amountCents: number }[] = [];
  let cash = openingFloatCents;
  let sales = 0;
  for (const m of moves) {
    if (m.kind === "sale" || m.kind === "refund" || m.kind === "void") {
      const slot = byMethod[m.method];
      slot.amountCents += m.amountCents;
      if (m.kind === "sale") slot.count++;
      sales += m.amountCents;
    }
    if (m.method !== "cash") continue;
    cash += m.amountCents;
    if (m.kind === "expense" || m.kind === "withdrawal" || m.kind === "supplier_payment") {
      const what =
        m.reason?.trim() ||
        (m.category ? EXPENSE_CATEGORIES[m.category as keyof typeof EXPENSE_CATEGORIES] : "");
      individual.push({
        label: `${MOVE_LABEL[m.kind]}${what ? `: ${what.charAt(0).toLowerCase()}${what.slice(1)}` : ""}`,
        amountCents: m.amountCents,
      });
      continue;
    }
    const label =
      m.kind === "sale"
        ? "Ventas en efectivo"
        : m.kind === "credit_payment"
          ? "Cobros de fiado en efectivo"
          : m.kind === "income"
            ? "Ingresos"
            : m.kind === "refund"
              ? "Devoluciones en efectivo"
              : "Anulaciones";
    grouped.set(label, (grouped.get(label) ?? 0) + m.amountCents);
  }
  const order = [
    "Ventas en efectivo",
    "Anulaciones",
    "Devoluciones en efectivo",
    "Cobros de fiado en efectivo",
    "Ingresos",
  ];
  const lines = [
    { label: "Fondo inicial", amountCents: openingFloatCents },
    ...order
      .filter((l) => grouped.has(l))
      .map((l) => ({ label: l, amountCents: grouped.get(l) ?? 0 })),
    ...individual,
  ];
  return { openingFloatCents, expectedCashCents: cash, lines, byMethod, salesCents: sales };
}

/** Billetes y monedas por defecto (Ajustes > Cajas), en pesos. */
export const DEFAULT_DENOMINATIONS = [20000, 10000, 2000, 1000, 500, 200, 100, 50, 20, 10];

/** Total de un conteo por denominación ({ "20000": 3 }) en centavos. */
export function countTotal(counts: Record<string, number>): number {
  return Object.entries(counts).reduce((s, [v, n]) => s + Number(v) * 100 * n, 0);
}

/** "turno mañana" o "turno tarde", según la hora de apertura. */
export function shiftName(openedAt: Date): string {
  const [h] = formatTime(openedAt).split(":").map(Number);
  return (h ?? 0) < 13 ? "turno mañana" : "turno tarde";
}

/** Turno abierto hace más de 14 h: "¿Te olvidaste de cerrar?". */
export function shiftTooLong(openedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - openedAt.getTime() > 14 * 3_600_000;
}

export type CloseMethod = "cash" | "debit" | "credit" | "qr" | "transfer";

export type CloseRow = {
  method: CloseMethod;
  label: string;
  systemCents: number;
  countedCents: number;
  differenceCents: number;
};

export type CloseResult = {
  rows: CloseRow[];
  cashDifferenceCents: number;
  /** Por encima de la tolerancia, el comentario es obligatorio y se avisa al dueño. */
  overTolerance: boolean;
};

/**
 * Resultado del arqueo por medio de pago: sobrante en verde, faltante en rojo, siempre con signo.
 * Los medios que no se contaron no se comparan.
 */
export function closeResult(a: {
  expectedCashCents: number;
  countedCashCents: number;
  system: Partial<Record<Exclude<CloseMethod, "cash">, number>>;
  counted: Partial<Record<Exclude<CloseMethod, "cash">, number>>;
  toleranceCents: number;
}): CloseResult {
  const rows: CloseRow[] = [
    {
      method: "cash",
      label: "Efectivo",
      systemCents: a.expectedCashCents,
      countedCents: a.countedCashCents,
      differenceCents: a.countedCashCents - a.expectedCashCents,
    },
  ];
  for (const m of ["debit", "credit", "qr", "transfer"] as const) {
    const sys = a.system[m] ?? 0;
    const cnt = a.counted[m];
    if (!sys && cnt === undefined) continue;
    rows.push({
      method: m,
      label: METHOD_LABEL[m],
      systemCents: sys,
      countedCents: cnt ?? sys,
      differenceCents: (cnt ?? sys) - sys,
    });
  }
  const diff = a.countedCashCents - a.expectedCashCents;
  return { rows, cashDifferenceCents: diff, overTolerance: Math.abs(diff) > a.toleranceCents };
}

/** "−$ 1.200", "+$ 300" o "$ 0". */
export function signedMoney(cents: number): string {
  const abs = formatMoney(Math.abs(cents));
  return cents > 0 ? `+${abs}` : cents < 0 ? `−${abs}` : abs;
}

/** Texto de la notificación del cierre al dueño. */
export function closeNotice(a: {
  shiftLabel: string;
  cashier: string;
  salesCents: number;
  countedCents: number;
  differenceCents: number;
}): string {
  return `Cierre ${a.shiftLabel} (${a.cashier}): ventas ${formatMoney(a.salesCents)}, efectivo contado ${formatMoney(a.countedCents)}, diferencia ${signedMoney(a.differenceCents)}`;
}
