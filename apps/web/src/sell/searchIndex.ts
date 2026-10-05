import { localDb } from "../data/db";
import type { LocalProduct } from "../data/types";

/** Sin tildes y en minúscula, para buscar "cafe" y encontrar "Café". */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

type Entry = { p: LocalProduct; text: string };

/**
 * Índice en memoria del catálogo local: buscar y sumar a la venta tiene que sentirse
 * instantáneo aun con 10.000 productos.
 */
export class ProductIndex {
  private entries: Entry[] = [];
  private byCode = new Map<string, LocalProduct>();

  load(products: LocalProduct[], codes: { productId: string; code: string }[]) {
    const active = products.filter((p) => p.active !== false);
    const byId = new Map(active.map((p) => [p.id, p]));
    this.byCode = new Map();
    for (const c of codes) {
      const p = byId.get(c.productId);
      if (p) this.byCode.set(c.code, p);
    }
    this.entries = active
      .map((p) => ({ p, text: normalize(`${p.name} ${p.internalCode ?? ""}`) }))
      .sort((a, b) => a.p.name.localeCompare(b.p.name, "es"));
  }

  get size() {
    return this.entries.length;
  }

  /** Todas las palabras tienen que aparecer; primero los que empiezan con la búsqueda. */
  search(term: string, limit = 8): LocalProduct[] {
    const t = normalize(term.trim());
    if (!t) return [];
    if (/^\d+$/.test(t)) {
      const exact = this.byCode.get(t) ?? this.entries.find((e) => e.p.internalCode === t)?.p;
      if (exact) return [exact];
    }
    const words = t.split(/\s+/);
    const starts: LocalProduct[] = [];
    const contains: LocalProduct[] = [];
    for (const e of this.entries) {
      if (!words.every((w) => e.text.includes(w))) continue;
      (e.text.startsWith(words[0] ?? "") ? starts : contains).push(e.p);
      if (starts.length >= limit) break;
    }
    return [...starts, ...contains].slice(0, limit);
  }

  quickButtons(): LocalProduct[] {
    return this.entries.filter((e) => e.p.quickButton).map((e) => e.p);
  }
}

let shared: ProductIndex | null = null;
let loadedVersion = -1;

/** El índice compartido, recargado desde la copia local cuando cambia. */
export async function productIndex(version: number): Promise<ProductIndex> {
  shared ??= new ProductIndex();
  if (version !== loadedVersion) {
    const db = localDb();
    shared.load(await db.products.toArray(), await db.barcodes.toArray());
    loadedVersion = version;
  }
  return shared;
}
