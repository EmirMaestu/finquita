// apps/api/src/admin/users.ts
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq, max } from "drizzle-orm";
import { hashPin, PIN_RE } from "../auth/pin";
import type { Db } from "../db/client";
import { authAccount, authSession, members, pinSessions, type Role } from "../db/schema/index";
import { audit } from "../lib/audit";

export const ADMIN_NOTE = "Soporte (panel de admin)";

/** Error que se le muestra tal cual a quien usa el panel. */
export class AdminError extends Error {}

export type AdminUser = {
  id: string;
  name: string;
  role: Role;
  email: string | null;
  active: boolean;
  hasAccount: boolean;
  hasPin: boolean;
  lastLogin: Date | null;
};

const ROLE_ORDER: Record<Role, number> = { owner: 0, manager: 1, cashier: 2, stocker: 3 };
// Sin caracteres que se confunden al dictarlos (0/O, 1/l/I).
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function tempPassword(length = 12): string {
  return Array.from(randomBytes(length), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function listUsers(db: Db): Promise<AdminUser[]> {
  const rows = await db.select().from(members);
  const byPassword = await db
    .select({ userId: authSession.userId, at: max(authSession.createdAt) })
    .from(authSession)
    .groupBy(authSession.userId);
  const byPin = await db
    .select({ memberId: pinSessions.memberId, at: max(pinSessions.createdAt) })
    .from(pinSessions)
    .groupBy(pinSessions.memberId);
  const pw = new Map(byPassword.map((r) => [r.userId, r.at]));
  const pin = new Map(byPin.map((r) => [r.memberId, r.at]));

  return rows
    .map((m) => {
      const dates = [m.authUserId ? pw.get(m.authUserId) : null, pin.get(m.id)].filter(
        (d): d is Date => d instanceof Date,
      );
      return {
        id: m.id,
        name: m.name,
        role: m.role,
        email: m.email,
        active: m.active,
        hasAccount: m.authUserId !== null,
        hasPin: m.pinHash !== null,
        lastLogin: dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null,
      };
    })
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findMember(db: Db, memberId: string) {
  // Un id mal formado no tiene que llegar a Postgres (daría un 500).
  if (!UUID_RE.test(memberId)) throw new AdminError("Esa persona no existe.");
  const [m] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
  if (!m) throw new AdminError("Esa persona no existe.");
  return m;
}

/** Pone una contraseña temporal, cierra todas sus sesiones y la devuelve (se muestra una vez). */
export async function resetPassword(db: Db, memberId: string, now = new Date()): Promise<string> {
  const m = await findMember(db, memberId);
  const userId = m.authUserId;
  if (!userId) throw new AdminError(`${m.name} no tiene cuenta con contraseña.`);
  const password = tempPassword();
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(authAccount)
      .set({ password: hash, updatedAt: now })
      .where(and(eq(authAccount.userId, userId), eq(authAccount.providerId, "credential")))
      .returning({ id: authAccount.id });
    if (!updated.length) throw new AdminError(`${m.name} no tiene cuenta con contraseña.`);
    await tx.delete(authSession).where(eq(authSession.userId, userId));
    await audit(tx, {
      action: "admin.reset_password",
      entityType: "member",
      entityId: m.id,
      note: ADMIN_NOTE,
      at: now,
    });
  });
  return password;
}

/** Pone un PIN nuevo, destraba el bloqueo por intentos y cierra sus sesiones de PIN. */
export async function resetPin(db: Db, memberId: string, pin: string, now = new Date()) {
  if (!PIN_RE.test(pin)) throw new AdminError("El PIN tiene que tener de 4 a 6 números.");
  const m = await findMember(db, memberId);
  const pinHash = await hashPin(pin);
  await db.transaction(async (tx) => {
    await tx
      .update(members)
      .set({ pinHash, pinFailedAttempts: 0, pinLockedUntil: null, updatedAt: now })
      .where(eq(members.id, m.id));
    await tx.delete(pinSessions).where(eq(pinSessions.memberId, m.id));
    await audit(tx, {
      action: "admin.reset_pin",
      entityType: "member",
      entityId: m.id,
      note: ADMIN_NOTE,
      at: now,
    });
  });
}
