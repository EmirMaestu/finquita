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
