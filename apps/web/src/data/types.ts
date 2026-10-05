import type { OpType, SyncOp } from "@mostrador/shared";

/** Copias locales de lo que baja del servidor (GET /api/sync/pull). */
export type LocalProduct = {
  id: string;
  name: string;
  categoryId: string | null;
  kind: "product" | "service";
  internalCode: string | null;
  saleUnit: "unit" | "kg" | "100g";
  stockBaseId: string | null;
  stockBaseFactor: number | null;
  priceCents: number;
  costCents?: number | null;
  marginBp?: number | null;
  fixedPrice: boolean;
  stockQty: number;
  minStock: number | null;
  ageRestricted: boolean;
  tracksExpiry: boolean;
  quickButton: boolean;
  needsReview: boolean;
  priceReview: boolean;
  active: boolean;
  location: string | null;
  photoUrl: string | null;
  containerProductId: string | null;
  updatedAt: string;
  priceUpdatedAt: string | null;
};

export type LocalBarcode = { id: string; productId: string; code: string };

export type LocalCustomer = {
  id: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  creditLimitCents: number;
  balanceCents: number;
  terms: string;
  termsDays: number;
  active: boolean;
};

export type LocalShift = {
  id: string;
  registerId: string;
  memberId: string;
  status: "open" | "closed";
  openedAt: string;
  openingFloatCents: number;
  closedAt: string | null;
  leftFloatCents: number | null;
};

export type Row = Record<string, unknown> & { id: string };

export type QueuedOp = {
  seq?: number;
  opId: string;
  type: OpType;
  op: SyncOp;
  attempts: number;
  lastError?: string;
  createdAt: string;
};

export type RejectedOp = { opId: string; type: OpType; op: SyncOp; reason: string; at: string };

/** Efecto optimista de una operación todavía no confirmada por el servidor. */
export type Delta = {
  id?: number;
  opId: string;
  kind: "stock" | "balance" | "cash";
  /** stock: id del producto base · balance: id del cliente · cash: id del turno */
  key: string;
  amount: number;
};

/** Movimiento de caja en el dispositivo: confirmado por el servidor o pendiente en la cola. */
export type LocalCashMove = {
  id: string;
  shiftId: string;
  kind:
    | "sale"
    | "refund"
    | "void"
    | "withdrawal"
    | "expense"
    | "income"
    | "credit_payment"
    | "supplier_payment";
  method: "cash" | "debit" | "credit" | "transfer" | "qr" | "account";
  amountCents: number;
  reason?: string | null;
  category?: string | null;
  memberId?: string | null;
  memberName?: string | null;
  authorizedByName?: string | null;
  refId?: string | null;
  at: string;
  /** Si vino de la cola local, su op_id (se descarta cuando el servidor lo devuelve). */
  opId?: string | null;
  source: "server" | "local";
};
