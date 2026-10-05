import { newId } from "@mostrador/shared";
import { normalize } from "../sell/searchIndex";
import { syncClient, syncEngine } from "../sync";
import { bumpLocalVersion } from "../sync/status";
import { localDb } from "./db";
import type { LocalCustomer } from "./types";

/** Saldo que ve el dispositivo: el del servidor más lo fiado sin confirmar. */
export async function localBalance(c: LocalCustomer): Promise<number> {
  const deltas = await localDb().deltas.where("[kind+key]").equals(["balance", c.id]).toArray();
  return c.balanceCents + deltas.reduce((s, d) => s + d.amount, 0);
}

export async function searchCustomers(term: string, limit = 8): Promise<LocalCustomer[]> {
  const all = (await localDb().customers.toArray()).filter((c) => c.active !== false);
  const t = normalize(term.trim());
  const list = t
    ? all.filter((c) => normalize(`${c.name} ${c.nickname ?? ""} ${c.phone ?? ""}`).includes(t))
    : all.sort((a, b) => b.balanceCents - a.balanceCents);
  return list.slice(0, limit);
}

/** Alta con dos campos (nombre y teléfono): queda en la copia local y viaja por la cola. */
export async function createCustomerLocal(
  memberId: string,
  a: { name: string; phone?: string | null },
): Promise<LocalCustomer> {
  const c: LocalCustomer = {
    id: newId(),
    name: a.name.trim(),
    nickname: null,
    phone: a.phone?.trim() || null,
    creditLimitCents: 0,
    balanceCents: 0,
    terms: "30d",
    termsDays: 30,
    active: true,
    overdueCents: 0,
    oldestDebtAt: null,
  };
  await localDb().customers.put(c);
  await syncClient().enqueue({
    opId: newId(),
    type: "customer.upsert",
    memberId,
    deviceAt: new Date().toISOString(),
    payload: { id: c.id, changes: { name: c.name, phone: c.phone } },
  });
  bumpLocalVersion();
  void syncEngine().kick();
  return c;
}

export type CustomerChanges = {
  name?: string;
  nickname?: string | null;
  phone?: string | null;
  address?: string | null;
  dni?: string | null;
  creditLimitCents?: number;
  terms?: "weekly" | "biweekly" | "30d" | "month_end";
};

/** Alta o edición de la ficha: viaja por la cola. */
export async function saveCustomerLocal(
  memberId: string,
  id: string | null,
  changes: CustomerChanges,
): Promise<string> {
  const db = localDb();
  const cid = id ?? newId();
  const cur = await db.customers.get(cid);
  await db.customers.put({
    ...(cur ?? {
      id: cid,
      balanceCents: 0,
      termsDays: 30,
      active: true,
      overdueCents: 0,
      oldestDebtAt: null,
      nickname: null,
      phone: null,
      creditLimitCents: 0,
      terms: "30d",
      name: "",
    }),
    ...(changes as Partial<LocalCustomer>),
    id: cid,
  } as LocalCustomer);
  await syncClient().enqueue({
    opId: newId(),
    type: "customer.upsert",
    memberId,
    deviceAt: new Date().toISOString(),
    payload: { id: cid, changes },
  });
  bumpLocalVersion();
  void syncEngine().kick();
  return cid;
}

/** Cobrar fiado: el efectivo entra a la caja del turno; baja el saldo local enseguida. */
export async function collectCreditLocal(
  memberId: string,
  p: {
    customerId: string;
    amountCents: number;
    method: "cash" | "debit" | "credit" | "transfer" | "qr";
    shiftId: string | null;
    applyTo: "oldest" | string[];
    note?: string | null;
  },
): Promise<string> {
  const id = newId();
  const opId = newId();
  const at = new Date().toISOString();
  if (p.shiftId) {
    await localDb().cashMoves.put({
      id: newId(),
      shiftId: p.shiftId,
      kind: "credit_payment",
      method: p.method,
      amountCents: p.amountCents,
      reason: "Cobro de fiado",
      category: null,
      memberId,
      authorizedByName: null,
      at,
      opId,
      source: "local",
    });
  }
  await syncClient().enqueue(
    {
      opId,
      type: "credit.payment",
      memberId,
      deviceAt: at,
      payload: {
        id,
        customerId: p.customerId,
        amountCents: p.amountCents,
        method: p.method,
        shiftId: p.shiftId,
        applyTo: p.applyTo,
        note: p.note ?? null,
      },
    },
    [{ kind: "balance", key: p.customerId, amount: -p.amountCents }],
  );
  bumpLocalVersion();
  void syncEngine().kick();
  return id;
}
