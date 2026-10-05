import { DEFAULT_SETTINGS, type SettingsMap } from "@mostrador/shared";
import { localDb } from "./db";
import { useLive } from "./live";

/** Ajustes desde la copia local, con los valores por defecto para lo que falte. */
export function useSettings(): SettingsMap {
  return useLive(
    async () => {
      const rows = await localDb().settings.toArray();
      const out = structuredClone(DEFAULT_SETTINGS) as SettingsMap;
      for (const r of rows) {
        const key = r.key as keyof SettingsMap;
        if (key in out)
          (out as Record<string, unknown>)[key] = {
            ...(out[key] as object),
            ...(r.value as object),
          };
      }
      return out;
    },
    [],
    DEFAULT_SETTINGS,
  );
}
