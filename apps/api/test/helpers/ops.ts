import { lineTotal, newId, type OpPayload, type OpType } from "@mostrador/shared";
import { seedId } from "../../src/seed/ids";
import { PRODUCTS } from "../../src/seed/scenario";
import { type MemberKey, memberId } from "./actors";

export const REGISTER = seedId("register:1");
export const product = (key: string) => seedId(`product:${key}`);
export const customer = (key: string) => seedId(`customer:${key}`);
const priceOf = (key: string) =>
  Math.round((PRODUCTS.find((p) => p.key === key)?.price ?? 0) * 100);

export function op<T extends OpType>(
  type: T,
  payload: OpPayload<T>,
  o: { by?: MemberKey; authorizedBy?: MemberKey; at?: string } = {},
) {
  return {
    opId: newId(),
    type,
    memberId: memberId(o.by ?? "tomas"),
    authorizedBy: o.authorizedBy ? memberId(o.authorizedBy) : null,
    deviceAt: o.at ?? new Date().toISOString(),
    payload,
  };
}

export function openShift(shiftId = newId(), floatCents = 2_000_000, by: MemberKey = "tomas") {
  return op(
    "cash.shift_open",
    { shiftId, registerId: REGISTER, openingFloatCents: floatCents },
    { by },
  );
}

type Item = { key: string; qty?: number };

/** Venta armada con los precios del escenario. */
export function saleOf(
  shiftId: string,
  items: Item[],
  pay: {
    method?: "cash" | "debit" | "account" | "qr";
    tendered?: number;
    customerId?: string;
  } = {},
  number = 4187,
): OpPayload<"sale.create"> {
  const lines = items.map((it) => {
    const p = PRODUCTS.find((x) => x.key === it.key);
    const qty = it.qty ?? 1;
    return {
      id: newId(),
      kind: "product" as const,
      productId: product(it.key),
      description: p?.name ?? it.key,
      qty,
      unit: (p?.unit === "kg" ? "kg" : "unit") as "kg" | "unit",
      unitPriceCents: priceOf(it.key),
      discountCents: 0,
      totalCents: lineTotal(priceOf(it.key), qty),
    };
  });
  const total = lines.reduce((s, l) => s + l.totalCents, 0);
  const method = pay.method ?? "cash";
  const tendered = method === "cash" ? (pay.tendered ?? total) : total;
  return {
    id: newId(),
    registerId: REGISTER,
    shiftId,
    number,
    customerId: pay.customerId ?? null,
    lines,
    payments: [
      {
        id: newId(),
        method,
        amountCents: tendered,
        tenderedCents: method === "cash" ? tendered : null,
        surchargeCents: 0,
        verified: false,
        customerId: method === "account" ? (pay.customerId ?? null) : null,
      },
    ],
    subtotalCents: total,
    discountCents: 0,
    surchargeCents: 0,
    totalCents: total,
    changeCents: tendered - total,
    receiptType: "ticket",
  };
}
