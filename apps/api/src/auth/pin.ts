import { hash, verify } from "@node-rs/argon2";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { members } from "../db/schema/index";

export const PIN_RE = /^\d{4,6}$/;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MS = 5 * 60_000;

export function hashPin(pin: string): Promise<string> {
  if (!PIN_RE.test(pin)) throw new Error("El PIN tiene que tener de 4 a 6 números");
  return hash(pin);
}

export type Member = typeof members.$inferSelect;

export type PinResult =
  | { ok: true; member: Member }
  | { ok: false; reason: "locked"; lockedUntil: Date }
  | { ok: false; reason: "wrong"; attemptsLeft: number }
  | { ok: false; reason: "no_pin" | "inactive" | "not_found" };

/**
 * Verifica el PIN de una persona. Cinco intentos fallidos la bloquean cinco minutos.
 * Se hace bajo un lock de fila para que dos intentos a la vez no se salteen el contador.
 */
export async function verifyMemberPin(
  db: Db,
  memberId: string,
  pin: string,
  now: Date = new Date(),
): Promise<PinResult> {
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(members).where(eq(members.id, memberId)).for("update");
    if (!m) return { ok: false, reason: "not_found" };
    if (!m.active) return { ok: false, reason: "inactive" };
    if (!m.pinHash) return { ok: false, reason: "no_pin" };
    if (m.pinLockedUntil && m.pinLockedUntil > now) {
      return { ok: false, reason: "locked", lockedUntil: m.pinLockedUntil };
    }
    const good = PIN_RE.test(pin) && (await verify(m.pinHash, pin).catch(() => false));
    if (good) {
      if (m.pinFailedAttempts !== 0 || m.pinLockedUntil) {
        await tx
          .update(members)
          .set({ pinFailedAttempts: 0, pinLockedUntil: null })
          .where(eq(members.id, m.id));
      }
      return { ok: true, member: { ...m, pinFailedAttempts: 0, pinLockedUntil: null } };
    }
    const attempts = m.pinFailedAttempts + 1;
    if (attempts >= MAX_PIN_ATTEMPTS) {
      const lockedUntil = new Date(now.getTime() + PIN_LOCK_MS);
      await tx
        .update(members)
        .set({ pinFailedAttempts: 0, pinLockedUntil: lockedUntil, updatedAt: sql`now()` })
        .where(eq(members.id, m.id));
      return { ok: false, reason: "locked", lockedUntil };
    }
    await tx.update(members).set({ pinFailedAttempts: attempts }).where(eq(members.id, m.id));
    return { ok: false, reason: "wrong", attemptsLeft: MAX_PIN_ATTEMPTS - attempts };
  });
}
