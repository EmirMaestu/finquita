import { bulkPreview, bulkSummary, DEFAULT_PRICING } from "@mostrador/shared";
import { and, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireActor } from "../auth/actor";
import { requirePermission } from "../auth/permissions";
import type { Db } from "../db/client";
import { categories, products, settings, supplierProducts } from "../db/schema/index";
import { upsertProduct } from "../domain/catalog";
import { runDomain } from "../domain/request";
import type { DbOrTx } from "../domain/types";
import { auditFrom } from "../lib/audit";
import { validate } from "../lib/validate";

const body = z.object({
  categoryId: z.uuid().optional(),
  supplierId: z.uuid().optional(),
  ids: z.array(z.uuid()).max(5000).optional(),
  mode: z.enum(["price_pct", "cost_pct", "recalc"]),
  percentBp: z.number().int().min(-9000).max(100000).default(0),
  roundingCents: z
    .number()
    .int()
    .refine((v) => [100, 1000, 5000, 10000].includes(v), "Redondeo a $ 1, $ 10, $ 50 o $ 100"),
});

async function selection(db: DbOrTx, b: z.infer<typeof body>) {
  const where: SQL[] = [
    isNull(products.deletedAt),
    eq(products.active, true),
    eq(products.kind, "product"),
  ];
  if (b.ids?.length) where.push(inArray(products.id, b.ids));
  if (b.categoryId) {
    const cat = or(
      eq(products.categoryId, b.categoryId),
      sql`${products.categoryId} in (select ${categories.id} from ${categories} where ${categories.parentId} = ${b.categoryId})`,
    );
    if (cat) where.push(cat);
  }
  if (b.supplierId) {
    where.push(
      sql`exists (select 1 from ${supplierProducts} where ${supplierProducts.productId} = ${products.id} and ${supplierProducts.supplierId} = ${b.supplierId})`,
    );
  }
  const rows = await db
    .select()
    .from(products)
    .where(and(...where))
    .orderBy(products.name);
  const cats = await db.select().from(categories);
  const catMargin = (id: string | null): number | null => {
    const c = cats.find((x) => x.id === id);
    if (!c) return null;
    return c.defaultMarginBp ?? catMargin(c.parentId);
  };
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    priceCents: p.priceCents,
    costCents: p.costCents,
    marginBp: p.marginBp,
    fixedPrice: p.fixedPrice,
    categoryMarginBp: catMargin(p.categoryId),
  }));
}

async function defaultMargin(db: Db | DbOrTx) {
  const [s] = await db.select().from(settings).where(eq(settings.key, "pricing"));
  return ((s?.value as { defaultMarginBp?: number } | undefined)?.defaultMarginBp ??
    DEFAULT_PRICING.defaultMarginBp) as number;
}

export const priceRoutes = new Hono<AppEnv>();

/** Vista previa: antes, después y ganancia resultante. No cambia nada. */
priceRoutes.post(
  "/prices/preview",
  requireActor(),
  requirePermission("change_prices"),
  validate("json", body),
  async (c) => {
    const b = c.req.valid("json");
    const db = c.get("db");
    const rows = bulkPreview(await selection(db, b), {
      ...b,
      defaultMarginBp: await defaultMargin(db),
    });
    return c.json({ rows, summary: bulkSummary(rows) });
  },
);

/** Confirmar: aplica los precios nuevos en una transacción y queda en Actividad. */
priceRoutes.post(
  "/prices/apply",
  requireActor(),
  requirePermission("change_prices"),
  validate("json", body),
  async (c) => {
    const b = c.req.valid("json");
    const db = c.get("db");
    const result = await runDomain(c, async (tx, ctx) => {
      const rows = bulkPreview(await selection(tx, b), {
        ...b,
        defaultMarginBp: await defaultMargin(tx),
      });
      const changed = rows.filter(
        (r) =>
          !r.skipped && (r.afterCents !== r.beforeCents || r.costAfterCents !== r.costBeforeCents),
      );
      for (const r of changed) {
        await upsertProduct(tx, ctx, {
          id: r.id,
          changes: {
            priceCents: r.afterCents,
            ...(r.costAfterCents !== r.costBeforeCents ? { costCents: r.costAfterCents } : {}),
            ...(r.marginAfterBp !== null ? { marginBp: r.marginAfterBp } : {}),
          },
        });
      }
      return { changedIds: changed.map((r) => r.id), summary: bulkSummary(rows) };
    });
    await auditFrom(c, db, {
      action: "product.bulk_price_change",
      entityType: "product",
      after: {
        mode: b.mode,
        percentBp: b.percentBp,
        roundingCents: b.roundingCents,
        changed: result.changedIds.length,
      },
    });
    return c.json(result);
  },
);
