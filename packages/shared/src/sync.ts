/**
 * Protocolo de sincronización (spec § Ventas sin conexión).
 * Cada dispositivo manda lo que hizo como una cola de operaciones con op_id único.
 */
import { z } from "zod";

// ── Tipos base ───────────────────────────────────────────────────────────────

export const uuid = z.uuid();
/** Plata en centavos. */
export const cents = z.number().int().safe();
export const positiveCents = cents.positive();
/** Cantidades con hasta tres decimales (pesables). */
export const qty = z
  .number()
  .finite()
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, "Hasta tres decimales");
export const dateStr = z.iso.date();
export const isoDateTime = z.iso.datetime({ offset: true });

export const paymentMethod = z.enum(["cash", "debit", "credit", "transfer", "qr", "account"]);
export type PaymentMethodCode = z.infer<typeof paymentMethod>;

// ── Ventas ───────────────────────────────────────────────────────────────────

export const saleLine = z.object({
  id: uuid,
  kind: z.enum(["product", "misc", "promo", "container", "discount"]).default("product"),
  productId: uuid.nullable(),
  categoryId: uuid.nullable().optional(),
  description: z.string().min(1).max(200),
  qty: qty.refine((v) => v !== 0, "La cantidad no puede ser cero"),
  unit: z.enum(["unit", "kg"]).default("unit"),
  unitPriceCents: cents,
  discountCents: cents.nonnegative().default(0),
  totalCents: cents,
  promotionId: uuid.nullable().optional(),
  note: z.string().max(200).nullable().optional(),
});

export const salePayment = z.object({
  id: uuid,
  method: paymentMethod,
  amountCents: positiveCents,
  tenderedCents: cents.nonnegative().nullable().optional(),
  surchargeCents: cents.default(0),
  verified: z.boolean().default(false),
  customerId: uuid.nullable().optional(),
});

export const saleCreate = z
  .object({
    id: uuid,
    registerId: uuid,
    shiftId: uuid.nullable(),
    number: z.number().int().positive(),
    customerId: uuid.nullable().default(null),
    lines: z.array(saleLine).min(1, "La venta no tiene ítems"),
    payments: z.array(salePayment).min(1, "La venta no tiene pagos"),
    subtotalCents: cents,
    discountCents: cents.nonnegative().default(0),
    surchargeCents: cents.default(0),
    totalCents: cents.nonnegative(),
    changeCents: cents.nonnegative().default(0),
    receiptType: z.enum(["ticket", "invoice"]).default("ticket"),
    note: z.string().max(500).nullable().optional(),
  })
  .superRefine((s, ctx) => {
    const lines = s.lines.reduce((a, l) => a + l.totalCents, 0);
    if (lines !== s.subtotalCents) {
      ctx.addIssue({
        code: "custom",
        path: ["subtotalCents"],
        message: "No coincide con los ítems",
      });
    }
    if (s.subtotalCents - s.discountCents + s.surchargeCents !== s.totalCents) {
      ctx.addIssue({
        code: "custom",
        path: ["totalCents"],
        message: "No coincide con el subtotal",
      });
    }
    const paid = s.payments.reduce((a, p) => a + p.amountCents, 0);
    if (paid - s.changeCents !== s.totalCents) {
      ctx.addIssue({ code: "custom", path: ["payments"], message: "Los pagos no cubren el total" });
    }
    const cash = s.payments
      .filter((p) => p.method === "cash")
      .reduce((a, p) => a + p.amountCents, 0);
    if (s.changeCents > cash) {
      ctx.addIssue({
        code: "custom",
        path: ["changeCents"],
        message: "El vuelto sale del efectivo",
      });
    }
    const account = s.payments.some((p) => p.method === "account");
    if (account && !s.customerId) {
      ctx.addIssue({
        code: "custom",
        path: ["customerId"],
        message: "El fiado necesita un cliente",
      });
    }
    const ids = new Set(s.lines.map((l) => l.id));
    if (ids.size !== s.lines.length) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "Líneas repetidas" });
    }
  });

export const saleVoid = z.object({
  saleId: uuid,
  reason: z.string().min(1).max(200),
});

export const saleReturn = z.object({
  id: uuid,
  saleId: uuid,
  reason: z.enum(["expired", "faulty", "exchange", "billing_error", "other"]),
  refundMethod: z.enum(["cash", "same", "credit"]),
  shiftId: uuid.nullable(),
  lines: z
    .array(
      z.object({
        id: uuid,
        saleLineId: uuid,
        qty: qty.refine((v) => v > 0, "La cantidad tiene que ser positiva"),
        totalCents: cents.nonnegative(),
        destination: z.enum(["shelf", "waste"]),
      }),
    )
    .min(1),
  totalCents: cents.nonnegative(),
});

// ── Caja ─────────────────────────────────────────────────────────────────────

/** Conteo por denominación: { "20000": 3, "1000": 5 } (valor en pesos → cantidad). */
export const denominations = z.record(z.string().regex(/^\d+$/), z.number().int().nonnegative());

export const shiftOpen = z.object({
  shiftId: uuid,
  registerId: uuid,
  openingFloatCents: cents.nonnegative(),
  counts: denominations.nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const cashMovement = z.object({
  id: uuid,
  shiftId: uuid,
  kind: z.enum(["withdrawal", "expense", "income", "supplier_payment"]),
  amountCents: positiveCents,
  reason: z.string().min(1, "Contá el motivo").max(200),
  category: z
    .enum(["cleaning", "freight", "maintenance", "salary_advance", "other"])
    .nullable()
    .optional(),
  note: z.string().max(500).nullable().optional(),
  invoiceId: uuid.nullable().optional(),
});

export const shiftClose = z.object({
  shiftId: uuid,
  countedCashCents: cents.nonnegative(),
  counts: denominations.nullable().optional(),
  otherMedia: z
    .record(z.string(), z.object({ counted: cents.nonnegative(), expected: cents.nonnegative() }))
    .nullable()
    .optional(),
  /** Lo que calculó el dispositivo (el servidor lo recalcula). */
  expectedCashCents: cents,
  differenceCents: cents,
  note: z.string().max(500).nullable().optional(),
  leftFloatCents: cents.nonnegative(),
  withdrawnCents: cents.nonnegative(),
});

// ── Stock y catálogo ─────────────────────────────────────────────────────────

export const stockAdjust = z
  .object({
    id: uuid,
    productId: uuid,
    /** Lo que entra (+) o sale (−)… */
    qty: qty.optional(),
    /** …o el stock real contado. */
    realQty: qty.optional(),
    reason: z.enum([
      "waste",
      "breakage",
      "expired",
      "missing",
      "internal_use",
      "load_error",
      "other",
    ]),
    note: z.string().max(500).nullable().optional(),
  })
  .refine((a) => (a.qty === undefined) !== (a.realQty === undefined), {
    message: "Indicá la cantidad o el stock real",
    path: ["qty"],
  });

export const productFields = z
  .object({
    name: z.string().min(1).max(120),
    categoryId: uuid.nullable(),
    kind: z.enum(["product", "service"]),
    internalCode: z.string().max(20).nullable(),
    saleUnit: z.enum(["unit", "kg", "100g"]),
    priceCents: cents.nonnegative(),
    costCents: cents.nonnegative().nullable(),
    marginBp: z.number().int().nullable(),
    fixedPrice: z.boolean(),
    vatBp: z.number().int(),
    minStock: qty.nullable(),
    location: z.string().max(60).nullable(),
    ageRestricted: z.boolean(),
    tracksExpiry: z.boolean(),
    quickButton: z.boolean(),
    active: z.boolean(),
    needsReview: z.boolean(),
  })
  .partial();
export type ProductFields = z.infer<typeof productFields>;

export const productUpsert = z.object({
  id: uuid,
  /** Solo los campos que cambió el dispositivo. */
  changes: productFields,
  /** Los valores que el dispositivo tenía antes de cambiar (para registrar ediciones concurrentes). */
  base: productFields.optional(),
  barcodes: z.array(z.string().min(3).max(32)).optional(),
  /** Stock inicial del alta rápida. */
  initialStock: qty.optional(),
});

// ── Clientes y fiado ─────────────────────────────────────────────────────────

export const customerUpsert = z.object({
  id: uuid,
  changes: z
    .object({
      name: z.string().min(1).max(120),
      nickname: z.string().max(60).nullable(),
      phone: z.string().max(30).nullable(),
      address: z.string().max(200).nullable(),
      dni: z.string().max(15).nullable(),
      creditLimitCents: cents.nonnegative(),
      terms: z.enum(["weekly", "biweekly", "30d", "month_end"]),
      notes: z.string().max(500).nullable(),
      active: z.boolean(),
    })
    .partial(),
});

export const creditPayment = z.object({
  id: uuid,
  customerId: uuid,
  amountCents: positiveCents,
  method: paymentMethod.exclude(["account"]),
  /** El efectivo entra a la caja del turno. */
  shiftId: uuid.nullable(),
  /** A qué deudas se aplica: las más viejas primero o tickets elegidos. */
  applyTo: z.union([z.literal("oldest"), z.array(uuid).min(1)]).default("oldest"),
  note: z.string().max(200).nullable().optional(),
});

export const shortageNote = z.object({
  id: uuid,
  productId: uuid,
  note: z.string().max(200).nullable().optional(),
});

// ── Operaciones ──────────────────────────────────────────────────────────────

export const OP_PAYLOADS = {
  "sale.create": saleCreate,
  "sale.void": saleVoid,
  "sale.return": saleReturn,
  "cash.shift_open": shiftOpen,
  "cash.movement": cashMovement,
  "cash.shift_close": shiftClose,
  "stock.adjust": stockAdjust,
  "product.upsert": productUpsert,
  "customer.upsert": customerUpsert,
  "credit.payment": creditPayment,
  "shortage.note": shortageNote,
} as const;

export type OpType = keyof typeof OP_PAYLOADS;
export const OP_TYPES = Object.keys(OP_PAYLOADS) as OpType[];
export type OpPayload<T extends OpType> = z.infer<(typeof OP_PAYLOADS)[T]>;

const envelope = {
  opId: uuid,
  memberId: uuid,
  /** Quién autorizó con su PIN en el dispositivo, si hizo falta. */
  authorizedBy: uuid.nullable().optional(),
  /** Hora del dispositivo cuando ocurrió. */
  deviceAt: isoDateTime,
};

export const syncOp = z.discriminatedUnion(
  "type",
  OP_TYPES.map((type) =>
    z.object({ ...envelope, type: z.literal(type), payload: OP_PAYLOADS[type] }),
  ) as unknown as [
    z.ZodObject<{ type: z.ZodLiteral<OpType> }>,
    ...z.ZodObject<{ type: z.ZodLiteral<OpType> }>[],
  ],
);

export type SyncOp = {
  [T in OpType]: {
    opId: string;
    memberId: string;
    authorizedBy?: string | null;
    deviceAt: string;
    type: T;
    payload: OpPayload<T>;
  };
}[OpType];

export const MAX_PUSH_BATCH = 100;

export const pushRequest = z.object({
  /** Reloj del dispositivo al mandar: si difiere más de 5 min del servidor, se marca. */
  deviceNow: isoDateTime,
  ops: z.array(z.unknown()).min(1).max(MAX_PUSH_BATCH),
});

export type OpResult =
  | { opId: string; status: "applied"; duplicate?: boolean; result?: Record<string, unknown> }
  | { opId: string; status: "rejected"; duplicate?: boolean; reason: string };

export type PushResponse = { results: OpResult[]; serverNow: string };

/** Valida una operación; si no se puede leer el op_id, devuelve null. */
export function parseOp(
  raw: unknown,
): { ok: true; op: SyncOp } | { ok: false; opId: string | null; reason: string } {
  const r = syncOp.safeParse(raw);
  if (r.success) return { ok: true, op: r.data as unknown as SyncOp };
  const opId =
    typeof raw === "object" &&
    raw &&
    "opId" in raw &&
    typeof raw.opId === "string" &&
    uuid.safeParse(raw.opId).success
      ? raw.opId
      : null;
  const issue = r.error.issues[0];
  const where = issue?.path.join(".");
  return {
    ok: false,
    opId,
    reason: `Datos inválidos${where ? ` en ${where}` : ""}: ${issue?.message ?? ""}`,
  };
}

// ── Reglas de conflicto ──────────────────────────────────────────────────────

export const CLOCK_SKEW_MS = 5 * 60_000;

/** La hora del dispositivo difiere en más de 5 minutos de la del servidor. */
export function isClockSkewed(deviceNow: Date, serverNow: Date): boolean {
  return Math.abs(deviceNow.getTime() - serverNow.getTime()) > CLOCK_SKEW_MS;
}

/**
 * Edición concurrente: gana el último cambio que llega al servidor, campo por campo.
 * Devuelve los campos a aplicar y cuáles pisan un cambio que el dispositivo no vio.
 */
export function mergeFields<T extends Record<string, unknown>>(
  current: T,
  changes: Partial<T>,
  base?: Partial<T>,
): { apply: Partial<T>; overwritten: (keyof T)[] } {
  const apply: Partial<T> = {};
  const overwritten: (keyof T)[] = [];
  for (const key of Object.keys(changes) as (keyof T)[]) {
    const next = changes[key];
    if (next === undefined) continue;
    if (JSON.stringify(current[key]) === JSON.stringify(next)) continue;
    apply[key] = next;
    if (base && key in base && JSON.stringify(base[key]) !== JSON.stringify(current[key])) {
      overwritten.push(key);
    }
  }
  return { apply, overwritten };
}

/**
 * Qué hace el servidor en cada conflicto del spec. Ninguno rechaza una venta que ya ocurrió.
 */
export const CONFLICT_RULES = {
  lastUnit: "Se aceptan las dos ventas; el stock queda negativo y aparece en Avisos",
  priceChangedOffline: "La venta queda con el precio que tenía el dispositivo",
  concurrentEdit:
    "Gana el último cambio, campo por campo, con la hora del servidor; queda en Actividad",
  creditOverLimitOffline: "La venta se acepta y el dueño recibe un aviso",
  duplicateBarcode: "El código queda en el producto original y va a Avisos para unir los productos",
  shiftClosedOffline: "El servidor recalcula el cierre y avisa si no coincide",
} as const;
