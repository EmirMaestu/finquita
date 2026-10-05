import type { Db } from "../db/client";
import { businesses } from "../db/schema/index";
import type { DbOrTx } from "../domain/types";

export type Business = typeof businesses.$inferSelect;

/** El negocio de esta instalación (hay uno solo). */
export async function getBusiness(db: Db | DbOrTx): Promise<Business | null> {
  const [b] = await db.select().from(businesses).limit(1);
  return b ?? null;
}
