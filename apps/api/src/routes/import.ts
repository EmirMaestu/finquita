import { type ImportRow, marginOnCostBp, newId, normalizeSheet } from "@mostrador/shared";
import { and, eq, ilike, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireActor } from "../auth/actor";
import { requirePermission } from "../auth/permissions";
import { barcodes, categories, products, supplierProducts, suppliers } from "../db/schema/index";
import { upsertProduct } from "../domain/catalog";
import { runDomain } from "../domain/request";
import type { DbOrTx } from "../domain/types";
import { auditFrom } from "../lib/audit";
import { validate } from "../lib/validate";

const body = z.object({
  rows: z
    .array(z.array(z.string().max(300)))
    .min(2)
    .max(20_001),
  mapping: z.record(z.string(), z.number().int().min(0).max(100)),
  /** Si es false, a los que ya existen solo se les actualiza costo y mínimo. */
  updatePrices: z.boolean().default(true),
});

type Product = typeof products.$inferSelect;

export type ImportItem = {
  line: number;
  action: "new" | "update" | "unchanged" | "error";
  name: string;
  productId?: string;
  errors: string[];
  changes?: Record<string, [unknown, unknown]>;
  warnings?: string[];
};

async function plan(
  db: DbOrTx,
  rows: ImportRow[],
  updatePrices = true,
): Promise<{ items: ImportItem[]; byLine: Map<number, Product | null> }> {
  const codes = rows.map((r) => r.barcode).filter((x): x is string => !!x);
  const plus = rows.map((r) => r.plu).filter((x): x is string => !!x);
  const byCode = new Map<string, string>();
  if (codes.length)
    for (const b of await db.select().from(barcodes).where(inArray(barcodes.code, codes)))
      byCode.set(b.code, b.productId);
  const all = await db.select().from(products).where(isNull(products.deletedAt));
  const byId = new Map(all.map((p) => [p.id, p]));
  const byPlu = new Map(
    all
      .filter((p) => p.internalCode && plus.includes(p.internalCode))
      .map((p) => [p.internalCode as string, p]),
  );
  const byName = new Map(all.map((p) => [p.name.toLowerCase(), p]));
  const seenCodes = new Map<string, number>();
  const items: ImportItem[] = [];
  const byLine = new Map<number, Product | null>();
  for (const r of rows) {
    const errors = [...r.errors];
    if (r.barcode) {
      const dup = seenCodes.get(r.barcode);
      if (dup) errors.push(`El código ${r.barcode} está repetido (fila ${dup})`);
      seenCodes.set(r.barcode, r.line);
    }
    if (errors.length) {
      items.push({ line: r.line, action: "error", name: r.name, errors });
      continue;
    }
    const match =
      (r.barcode && byCode.has(r.barcode)
        ? byId.get(byCode.get(r.barcode) as string)
        : undefined) ??
      (r.plu ? byPlu.get(r.plu) : undefined) ??
      byName.get(r.name.toLowerCase());
    byLine.set(r.line, match ?? null);
    if (!match) {
      items.push({ line: r.line, action: "new", name: r.name, errors: [] });
      continue;
    }
    const changes: Record<string, [unknown, unknown]> = {};
    if (updatePrices && r.priceCents !== null && r.priceCents !== match.priceCents)
      changes.priceCents = [match.priceCents, r.priceCents];
    if (r.costCents !== null && r.costCents !== match.costCents)
      changes.costCents = [match.costCents, r.costCents];
    if (r.minStock !== null && r.minStock !== match.minStock)
      changes.minStock = [match.minStock, r.minStock];
    if (r.name !== match.name && r.barcode && byCode.has(r.barcode))
      changes.name = [match.name, r.name];
    const warnings: string[] = [];
    if (r.stock !== null && r.stock !== match.stockQty)
      warnings.push("El stock de los productos que ya existen no se toca: hacé un conteo.");
    if (match.fixedPrice && changes.priceCents)
      warnings.push("Tiene precio fijo: el precio se actualiza igual porque viene de tu lista.");
    items.push({
      line: r.line,
      action: Object.keys(changes).length ? "update" : "unchanged",
      name: r.name,
      productId: match.id,
      errors: [],
      changes,
      warnings,
    });
  }
  return { items, byLine };
}

function summary(items: ImportItem[]) {
  const n = (a: ImportItem["action"]) => items.filter((i) => i.action === a).length;
  return { new: n("new"), updated: n("update"), unchanged: n("unchanged"), errors: n("error") };
}

export const importRoutes = new Hono<AppEnv>();

/** Vista previa: nuevos, actualizados y con error. No cambia nada. */
importRoutes.post(
  "/import/products/preview",
  requireActor(),
  requirePermission("change_prices"),
  validate("json", body),
  async (c) => {
    const { rows, mapping, updatePrices } = c.req.valid("json");
    const normalized = normalizeSheet(rows, mapping);
    const { items } = await plan(c.get("db"), normalized, updatePrices);
    return c.json({ summary: summary(items), items: items.slice(0, 2000) });
  },
);

/** Confirmar: aplica todo en una transacción (si algo falla, no queda nada a medias). */
importRoutes.post(
  "/import/products/confirm",
  requireActor(),
  requirePermission("change_prices"),
  validate("json", body),
  async (c) => {
    const { rows, mapping, updatePrices } = c.req.valid("json");
    const normalized = normalizeSheet(rows, mapping);
    const result = await runDomain(c, async (tx, ctx) => {
      const { items, byLine } = await plan(tx, normalized, updatePrices);
      const catCache = new Map<string, string>();
      const categoryId = async (name: string | null): Promise<string | null> => {
        if (!name) return null;
        const [parentName, childName] = name.split(/\s*[>›]\s*/);
        const key = name.toLowerCase();
        const cached = catCache.get(key);
        if (cached) return cached;
        const findOrCreate = async (n: string, parentId: string | null) => {
          const [found] = await tx
            .select()
            .from(categories)
            .where(
              and(
                ilike(categories.name, n),
                isNull(categories.deletedAt),
                parentId ? eq(categories.parentId, parentId) : isNull(categories.parentId),
              ),
            );
          if (found) return found.id;
          // También vale el nombre de una subcategoría ya existente.
          if (!parentId) {
            const [child] = await tx
              .select()
              .from(categories)
              .where(and(ilike(categories.name, n), isNull(categories.deletedAt)));
            if (child) return child.id;
          }
          const id = newId();
          await tx.insert(categories).values({ id, name: n, parentId });
          return id;
        };
        const parent = await findOrCreate(parentName ?? name, null);
        const id = childName ? await findOrCreate(childName, parent) : parent;
        catCache.set(key, id);
        return id;
      };
      const supplierRows = await tx.select().from(suppliers).where(isNull(suppliers.deletedAt));
      for (const r of normalized) {
        const item = items.find((i) => i.line === r.line);
        if (!item || item.action === "error" || item.action === "unchanged") continue;
        const match = byLine.get(r.line) ?? null;
        const id = match?.id ?? newId();
        const changes: Record<string, unknown> = {};
        if (!match) {
          changes.name = r.name;
          changes.priceCents = r.priceCents ?? 0;
          changes.saleUnit = r.unit;
          changes.categoryId = await categoryId(r.category);
          if (r.plu) changes.internalCode = r.plu;
        } else if (item.changes?.name) changes.name = r.name;
        if (r.priceCents !== null && (!match || item.changes?.priceCents))
          changes.priceCents = r.priceCents;
        if (r.costCents !== null) changes.costCents = r.costCents;
        if (r.minStock !== null) changes.minStock = r.minStock;
        const cost = (changes.costCents as number | undefined) ?? match?.costCents ?? null;
        const price = (changes.priceCents as number | undefined) ?? match?.priceCents ?? 0;
        if (cost) changes.marginBp = marginOnCostBp(cost, price);
        await upsertProduct(tx, ctx, {
          id,
          changes,
          barcodes: r.barcode ? [r.barcode] : undefined,
          initialStock: !match && r.stock ? r.stock : undefined,
        });
        if (r.supplier) {
          const s = supplierRows.find((x) => x.name.toLowerCase() === r.supplier?.toLowerCase());
          if (s) {
            await tx
              .insert(supplierProducts)
              .values({
                id: newId(),
                supplierId: s.id,
                productId: id,
                costCents: r.costCents,
                isPrimary: !match,
              })
              .onConflictDoUpdate({
                target: [supplierProducts.supplierId, supplierProducts.productId],
                set: { costCents: r.costCents, updatedAt: new Date() },
              });
          }
        }
      }
      return summary(items);
    });
    await auditFrom(c, c.get("db"), {
      action: "product.imported",
      entityType: "product",
      after: result,
    });
    return c.json({ summary: result });
  },
);
