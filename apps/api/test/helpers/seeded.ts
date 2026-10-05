import { afterAll, beforeAll, beforeEach } from "vitest";
import { hashPin } from "../../src/auth/pin";
import { seed } from "../../src/seed/seed";
import { createTestDb, type TestDb } from "../db";

export const SCENARIO_TODAY = "2026-10-03";

const pinCache = new Map<string, Promise<string>>();
/** argon2 es lento a propósito: en los tests se calcula una vez por PIN. */
export function cachedHashPin(pin: string): Promise<string> {
  let h = pinCache.get(pin);
  if (!h) {
    h = hashPin(pin);
    pinCache.set(pin, h);
  }
  return h;
}

/**
 * Base propia para el archivo con el escenario de ejemplo cargado,
 * restaurada antes de cada test.
 */
export function useSeededDb(opts: { today?: string } = {}) {
  const ref = {} as { t: TestDb };
  beforeAll(async () => {
    ref.t = await createTestDb();
    await seed(ref.t.db, { today: opts.today ?? SCENARIO_TODAY, hashPin: cachedHashPin });
    await ref.t.snapshot();
  });
  afterAll(async () => {
    await ref.t.close();
  });
  beforeEach(async () => {
    await ref.t.restore();
  });
  return ref;
}
