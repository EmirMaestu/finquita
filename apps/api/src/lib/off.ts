import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { offCache } from "../db/schema/index";
import { log } from "./log";

export type OffProduct = {
  name: string | null;
  brand: string | null;
  quantity: string | null;
  imageUrl: string | null;
};

export type OffConfig = {
  /** La base es abierta pero pide identificar la app. */
  userAgent: string;
  baseUrl: string;
  /** Consultas por minuto (Open Food Facts permite 15). */
  perMinute: number;
  disabled: boolean;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  now: () => number;
};

export function offConfigFromEnv(): Partial<OffConfig> {
  return {
    userAgent: process.env.OFF_USER_AGENT ?? "Mostrador/0.1 (almacen; contacto en el subdominio)",
    baseUrl: process.env.OFF_BASE_URL ?? "https://world.openfoodfacts.org",
    disabled: process.env.OFF_DISABLED === "1",
  };
}

const HIT_TTL = 30 * 86_400_000;
const MISS_TTL = 7 * 86_400_000;

export type OffResult =
  | { status: "found"; product: OffProduct; cached: boolean }
  | { status: "not_found"; cached: boolean }
  | { status: "rate_limited" }
  | { status: "unavailable" };

/**
 * Proxy de Open Food Facts: los dispositivos nunca lo llaman directo. Con caché (también de
 * los que no están) y un límite de 15 consultas por minuto para no pasarse de lo permitido.
 */
export class OffClient {
  private cfg: OffConfig;
  private calls: number[] = [];

  constructor(
    private db: Db,
    cfg: Partial<OffConfig> = {},
  ) {
    this.cfg = {
      userAgent: "Mostrador/0.1",
      baseUrl: "https://world.openfoodfacts.org",
      perMinute: 15,
      disabled: false,
      fetch: (url, init) => fetch(url, init),
      now: () => Date.now(),
      ...cfg,
    };
  }

  private allow(): boolean {
    const t = this.cfg.now();
    this.calls = this.calls.filter((x) => t - x < 60_000);
    if (this.calls.length >= this.cfg.perMinute) return false;
    this.calls.push(t);
    return true;
  }

  async lookup(code: string): Promise<OffResult> {
    const [hit] = await this.db.select().from(offCache).where(eq(offCache.code, code));
    if (hit) {
      const age = this.cfg.now() - hit.fetchedAt.getTime();
      if (age < (hit.found ? HIT_TTL : MISS_TTL)) {
        return hit.found && hit.data
          ? { status: "found", product: hit.data, cached: true }
          : { status: "not_found", cached: true };
      }
    }
    if (this.cfg.disabled) return { status: "unavailable" };
    if (!this.allow()) return { status: "rate_limited" };
    let body: { status?: number; product?: Record<string, unknown> };
    try {
      const res = await this.cfg.fetch(
        `${this.cfg.baseUrl}/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_es,brands,quantity,image_front_small_url`,
        {
          headers: { "User-Agent": this.cfg.userAgent, Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (res.status === 404) body = { status: 0 };
      else if (!res.ok) return { status: "unavailable" };
      else body = (await res.json()) as typeof body;
    } catch (err) {
      log.warn("open food facts no respondió", { error: String(err) });
      return { status: "unavailable" };
    }
    const p = body.product;
    const name = (p?.product_name_es as string) || (p?.product_name as string) || null;
    const found = body.status === 1 && Boolean(name);
    const data: OffProduct | null = found
      ? {
          name,
          brand: ((p?.brands as string) ?? "").split(",")[0]?.trim() || null,
          quantity: (p?.quantity as string) || null,
          imageUrl: (p?.image_front_small_url as string) || null,
        }
      : null;
    const fetchedAt = new Date(this.cfg.now());
    await this.db
      .insert(offCache)
      .values({ code, found, data, fetchedAt })
      .onConflictDoUpdate({ target: offCache.code, set: { found, data, fetchedAt } });
    return found && data
      ? { status: "found", product: data, cached: false }
      : { status: "not_found", cached: false };
  }
}

/** Nombre sugerido para el alta: "Galletitas Criollitas 169 g". */
export function suggestedName(p: OffProduct): string | null {
  if (!p.name) return null;
  const name = p.name.trim();
  const brand = p.brand && !name.toLowerCase().includes(p.brand.toLowerCase()) ? ` ${p.brand}` : "";
  const qty = p.quantity && !name.includes(p.quantity) ? ` ${p.quantity}` : "";
  return `${name}${brand}${qty}`.replace(/\s+/g, " ");
}
