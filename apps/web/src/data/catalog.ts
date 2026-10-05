import { localDb } from "./db";
import type { LocalProduct } from "./types";

/**
 * Código interno de la planilla: EAN-13 que empieza con 2 ("2" + PLU de 11 dígitos + verificador).
 * Devuelve el PLU sin ceros adelante, o null si no es uno de esos.
 */
export function pluFromInternalBarcode(code: string): string | null {
  if (!/^2\d{12}$/.test(code)) return null;
  return String(Number(code.slice(1, 12)));
}

/** Busca un producto por código de barras o PLU en la copia local (instantáneo y sin conexión). */
export async function findByCode(code: string): Promise<LocalProduct | null> {
  const db = localDb();
  const bc = await db.barcodes.where("code").equals(code).first();
  if (bc) {
    const p = await db.products.get(bc.productId);
    if (p?.active !== false && p) return p;
  }
  const plu = pluFromInternalBarcode(code) ?? code;
  const byPlu = await db.products.where("internalCode").equals(plu).first();
  return byPlu && byPlu.active !== false ? byPlu : null;
}

/** Stock que se ve en el dispositivo: el del servidor más lo vendido sin confirmar. */
export async function localStock(p: LocalProduct): Promise<number> {
  const db = localDb();
  const baseId = p.stockBaseId ?? p.id;
  const base = p.stockBaseId ? await db.products.get(baseId) : p;
  const deltas = await db.deltas.where("[kind+key]").equals(["stock", baseId]).toArray();
  const total = (base?.stockQty ?? 0) + deltas.reduce((s, d) => s + d.amount, 0);
  return p.stockBaseId ? Math.floor((total / (p.stockBaseFactor ?? 1)) * 1000) / 1000 : total;
}
