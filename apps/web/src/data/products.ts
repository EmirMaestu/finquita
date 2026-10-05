import { type StockState, stockState } from "@mostrador/shared";
import { api, OfflineError } from "./api";
import { localDb } from "./db";

export type ProductItem = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  supplierName: string | null;
  kind: "product" | "service";
  internalCode: string | null;
  saleUnit: "unit" | "kg" | "100g";
  priceCents: number;
  costCents?: number | null;
  avgCostCents?: number | null;
  marginBp?: number | null;
  fixedPrice: boolean;
  vatBp: number;
  stockQty: number;
  minStock: number | null;
  stockState: StockState;
  stockBaseId: string | null;
  stockBaseFactor: number | null;
  containerProductId: string | null;
  location: string | null;
  ageRestricted: boolean;
  tracksExpiry: boolean;
  quickButton: boolean;
  needsReview: boolean;
  priceReview: boolean;
  active: boolean;
  commissionBp: number | null;
  purchaseUnitName: string | null;
  purchaseUnitQty: number | null;
  barcodes: string[];
  chips: string[];
  priceUpdatedAt: string | null;
  updatedAt: string;
};

export type ProductDetail = ProductItem & {
  suppliers: {
    supplierId: string;
    name: string;
    supplierCode: string | null;
    isPrimary: boolean;
    packQty: number | null;
    costCents?: number | null;
  }[];
  linked: { id: string; name: string; factor: number; priceCents: number }[];
  history: {
    id: string;
    action: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    memberId: string | null;
    note: string | null;
    createdAt: string;
  }[];
  movements: {
    id: string;
    kind: string;
    qty: number;
    resultingQty: number | null;
    reason: string | null;
    createdAt: string;
    status: string;
  }[];
  lots: { id: string; expiresOn: string; qtyRemaining: number; code: string | null }[];
};

export type ProductFilter =
  | "low"
  | "out"
  | "negative"
  | "expiring"
  | "stale"
  | "inactive"
  | "no_cost";

export type ProductQuery = {
  q?: string;
  filter?: ProductFilter;
  categoryId?: string;
  limit?: number;
  offset?: number;
};

export type ProductPage = {
  items: ProductItem[];
  total: number;
  hasMore: boolean;
  offline?: boolean;
};

/** Lista de productos: de la API, o de la copia local si no hay conexión. */
export async function fetchProducts(q: ProductQuery): Promise<ProductPage> {
  const params = new URLSearchParams();
  if (q.q) params.set("q", q.q);
  if (q.filter) params.set("filter", q.filter);
  if (q.categoryId) params.set("categoryId", q.categoryId);
  params.set("limit", String(q.limit ?? 100));
  if (q.offset) params.set("offset", String(q.offset));
  try {
    return await api<ProductPage>(`/api/products?${params}`);
  } catch (err) {
    if (!(err instanceof OfflineError)) throw err;
    return { ...(await localProducts(q)), offline: true };
  }
}

/** Búsqueda en la copia local (sin conexión). */
export async function localProducts(q: ProductQuery): Promise<ProductPage> {
  const db = localDb();
  const all = await db.products.toArray();
  const codes = await db.barcodes.toArray();
  const byProduct = new Map<string, string[]>();
  for (const c of codes)
    byProduct.set(c.productId, [...(byProduct.get(c.productId) ?? []), c.code]);
  const term = q.q?.toLowerCase().trim();
  const items = all
    .filter((p) => (q.filter === "inactive" ? !p.active : p.active))
    .map((p): ProductItem => {
      const st = stockState(p.stockQty, p.minStock);
      return {
        ...(p as unknown as ProductItem),
        categoryName: null,
        supplierName: null,
        barcodes: byProduct.get(p.id) ?? [],
        stockState: p.kind === "service" ? "ok" : st,
        chips: [],
      };
    })
    .filter((p) => {
      if (
        term &&
        !(
          p.name.toLowerCase().includes(term) ||
          p.internalCode === term ||
          p.barcodes.includes(term)
        )
      )
        return false;
      if (q.categoryId && p.categoryId !== q.categoryId) return false;
      if (q.filter === "low") return p.stockState === "low";
      if (q.filter === "out") return p.stockState === "out";
      if (q.filter === "negative") return p.stockState === "negative";
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const off = q.offset ?? 0;
  const lim = q.limit ?? 100;
  return {
    items: items.slice(off, off + lim),
    total: items.length,
    hasMore: items.length > off + lim,
  };
}

export function fetchProduct(id: string): Promise<ProductDetail> {
  return api<ProductDetail>(`/api/products/${id}`);
}

export type Category = {
  id: string;
  name: string;
  parentId: string | null;
  defaultMarginBp: number | null;
  products: number;
  children: Category[];
};

export function fetchCategories(): Promise<Category[]> {
  return api<Category[]>("/api/categories");
}
