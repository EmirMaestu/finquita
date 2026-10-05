import type { Promotion } from "@mostrador/shared";
import { localDb } from "./db";
import { useLive } from "./live";

/** Promociones de la copia local (para aplicarlas sin conexión). */
export function useLocalPromotions(enabled: boolean): Promotion[] {
  return useLive(
    async () => {
      if (!enabled) return [];
      const rows = (await localDb().promotions.toArray()) as unknown as (Promotion & {
        deletedAt?: string | null;
      })[];
      return rows
        .filter((p) => !p.deletedAt)
        .map((p) => ({ ...p, params: p.params ?? {}, products: p.products ?? [] }));
    },
    [enabled],
    [],
  );
}
