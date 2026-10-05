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

export type QuickProductInput = {
  name: string;
  priceCents: number;
  categoryId?: string | null;
  code?: string | null;
  saleUnit?: "unit" | "kg";
  initialStock?: number | null;
  costCents?: number | null;
};

/**
 * Alta rápida: queda en la copia local al instante (para seguir vendiendo) y viaja al
 * servidor por la cola, así funciona sin conexión. Sin costo, queda "Completar ficha".
 */
export async function quickCreateProduct(
  memberId: string,
  input: QuickProductInput,
): Promise<LocalProduct> {
  const { newId } = await import("@mostrador/shared");
  const { syncClient, syncEngine } = await import("../sync");
  const db = localDb();
  const id = newId();
  const now = new Date().toISOString();
  const product: LocalProduct = {
    id,
    name: input.name.trim(),
    categoryId: input.categoryId ?? null,
    kind: "product",
    internalCode: null,
    saleUnit: input.saleUnit ?? "unit",
    stockBaseId: null,
    stockBaseFactor: null,
    priceCents: input.priceCents,
    costCents: input.costCents ?? null,
    fixedPrice: false,
    stockQty: 0,
    minStock: null,
    ageRestricted: false,
    tracksExpiry: false,
    quickButton: false,
    needsReview: input.costCents == null,
    priceReview: false,
    active: true,
    location: null,
    photoUrl: null,
    containerProductId: null,
    updatedAt: now,
    priceUpdatedAt: now,
  };
  await db.products.put(product);
  if (input.code) await db.barcodes.put({ id: newId(), productId: id, code: input.code });
  await syncClient().enqueue(
    {
      opId: newId(),
      type: "product.upsert",
      memberId,
      deviceAt: now,
      payload: {
        id,
        changes: {
          name: product.name,
          priceCents: product.priceCents,
          categoryId: product.categoryId,
          saleUnit: product.saleUnit,
          ...(input.costCents != null ? { costCents: input.costCents } : {}),
        },
        ...(input.code ? { barcodes: [input.code] } : {}),
        ...(input.initialStock ? { initialStock: input.initialStock } : {}),
      },
    },
    input.initialStock ? [{ kind: "stock", key: id, amount: input.initialStock }] : [],
  );
  void syncEngine().kick();
  return product;
}

export type OffSuggestion = { found: boolean; name?: string | null; imageUrl?: string | null };

/** Nombre y foto de Open Food Facts (por la API). Sin conexión o sin datos, nada. */
export async function offSuggestion(code: string): Promise<OffSuggestion | null> {
  if (!/^\d{8,14}$/.test(code) || code.startsWith("2")) return null;
  try {
    const { api } = await import("./api");
    return await api<OffSuggestion>(`/api/off/${code}`);
  } catch {
    return null;
  }
}
