import {
  addDays,
  effectiveGrant,
  marginOnCostBp,
  newId,
  productFields,
  qty as qtySchema,
  stockState,
  todayAR,
} from "@mostrador/shared";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { loadOverrides, requirePermission } from "../auth/permissions";
import type { Db } from "../db/client";
import {
  auditLog,
  barcodes,
  categories,
  lots,
  products,
  stockMovements,
  supplierProducts,
  suppliers,
} from "../db/schema/index";
import { upsertProduct } from "../domain/catalog";
import { runDomain } from "../domain/request";
import { auditFrom, diff } from "../lib/audit";
import { conflict, notFound } from "../lib/errors";
import { validate } from "../lib/validate";

export const catalogRoutes = new Hono<AppEnv>();

type ProductRow = typeof products.$inferSelect;

async function canSeeCosts(c: Parameters<typeof actorOf>[0]): Promise<boolean> {
  const { member } = actorOf(c);
  return (
    effectiveGrant(member.role, "view_costs", await loadOverrides(c.get("db"), member.id)) ===
    "allow"
  );
}

/** Fila de la lista con estado de stock y chips. Lo que no se puede ver, no viaja. */
async function present(db: Db, rows: ProductRow[], costs: boolean) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const codes = await db.select().from(barcodes).where(inArray(barcodes.productId, ids));
  const baseIds = [...new Set(rows.map((r) => r.stockBaseId).filter((x): x is string => !!x))];
  const bases = baseIds.length
    ? await db.select().from(products).where(inArray(products.id, baseIds))
    : [];
  const baseById = new Map(bases.map((b) => [b.id, b]));
  const cats = await db.select({ id: categories.id, name: categories.name }).from(categories);
  const catName = new Map(cats.map((x) => [x.id, x.name]));
  return rows.map((r) => {
    const base = r.stockBaseId ? baseById.get(r.stockBaseId) : undefined;
    const stock = base
      ? Math.floor((base.stockQty / (r.stockBaseFactor ?? 1)) * 1000) / 1000
      : r.stockQty;
    const chips: string[] = [];
    if (r.needsReview) chips.push("needs_review");
    if (r.priceReview) chips.push("price_review");
    if (costs) {
      if (r.costCents == null) chips.push("no_cost");
      else if (r.priceCents < r.costCents) chips.push("losing_money");
    }
    const { costCents, avgCostCents, marginBp, ...rest } = r;
    return {
      ...rest,
      ...(costs
        ? {
            costCents,
            avgCostCents,
            marginBp: costCents ? marginOnCostBp(costCents, r.priceCents) : marginBp,
          }
        : {}),
      categoryName: r.categoryId ? (catName.get(r.categoryId) ?? null) : null,
      barcodes: codes.filter((b) => b.productId === r.id).map((b) => b.code),
      stockQty: stock,
      stockState: r.kind === "service" ? "ok" : stockState(stock, r.minStock),
      chips,
    };
  });
}

const listQuery = z.object({
  q: z.string().max(80).optional(),
  categoryId: z.uuid().optional(),
  supplierId: z.uuid().optional(),
  filter: z
    .enum(["low", "out", "negative", "expiring", "stale", "inactive", "review", "quick"])
    .optional(),
  sort: z.enum(["name", "stock", "price", "updated"]).default("name"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Lista de productos: buscador, filtros y orden. */
catalogRoutes.get("/products", requireActor(), validate("query", listQuery), async (c) => {
  const f = c.req.valid("query");
  const db = c.get("db");
  const where: (SQL | undefined)[] = [isNull(products.deletedAt)];
  where.push(f.filter === "inactive" ? eq(products.active, false) : eq(products.active, true));
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    where.push(
      or(
        ilike(products.name, like),
        eq(products.internalCode, f.q),
        sql`exists (select 1 from ${barcodes} where ${barcodes.productId} = ${products.id} and ${barcodes.code} = ${f.q})`,
      ),
    );
  }
  if (f.categoryId) {
    where.push(
      or(
        eq(products.categoryId, f.categoryId),
        sql`${products.categoryId} in (select ${categories.id} from ${categories} where ${categories.parentId} = ${f.categoryId})`,
      ),
    );
  }
  if (f.supplierId) {
    where.push(
      sql`exists (select 1 from ${supplierProducts} where ${supplierProducts.productId} = ${products.id} and ${supplierProducts.supplierId} = ${f.supplierId})`,
    );
  }
  const notService = sql`${products.kind} <> 'service' and ${products.stockBaseId} is null`;
  if (f.filter === "low")
    where.push(
      and(
        notService,
        gt(products.stockQty, 0),
        lt(products.stockQty, sql`coalesce(${products.minStock}, 0)`),
      ),
    );
  if (f.filter === "out") where.push(and(notService, eq(products.stockQty, 0)));
  if (f.filter === "negative") where.push(and(notService, lt(products.stockQty, 0)));
  if (f.filter === "stale")
    where.push(lt(products.priceUpdatedAt, new Date(Date.now() - 30 * 86_400_000)));
  if (f.filter === "review")
    where.push(or(eq(products.needsReview, true), eq(products.priceReview, true)));
  if (f.filter === "quick") where.push(eq(products.quickButton, true));
  if (f.filter === "expiring") {
    where.push(
      sql`exists (select 1 from ${lots} where ${lots.productId} = ${products.id} and ${lots.qtyRemaining} > 0 and ${lots.expiresOn} <= ${addDays(todayAR(), 30)})`,
    );
  }
  const order =
    f.sort === "stock"
      ? [asc(products.stockQty)]
      : f.sort === "price"
        ? [desc(products.priceCents)]
        : f.sort === "updated"
          ? [desc(products.updatedAt)]
          : [asc(products.name)];
  const rows = await db
    .select()
    .from(products)
    .where(and(...where))
    .orderBy(...order, asc(products.id))
    .limit(f.limit + 1)
    .offset(f.offset);
  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(products)
    .where(and(...where));
  return c.json({
    items: await present(db, rows.slice(0, f.limit), await canSeeCosts(c)),
    total,
    hasMore: rows.length > f.limit,
  });
});

/** Buscar por código de barras o PLU (escaneo con conexión). */
catalogRoutes.get("/barcodes/:code", requireActor(), async (c) => {
  const code = c.req.param("code");
  const db = c.get("db");
  const [byCode] = await db
    .select({ p: products })
    .from(barcodes)
    .innerJoin(products, eq(products.id, barcodes.productId))
    .where(and(eq(barcodes.code, code), isNull(products.deletedAt)));
  const [byPlu] = byCode
    ? []
    : await db
        .select({ p: products })
        .from(products)
        .where(and(eq(products.internalCode, code), isNull(products.deletedAt)));
  const hit = byCode ?? byPlu;
  if (!hit) throw notFound(`El código ${code} no está cargado.`);
  const [item] = await present(db, [hit.p], await canSeeCosts(c));
  return c.json(item);
});

/** Ficha: datos, códigos, proveedores, presentaciones e historial de precio. */
catalogRoutes.get("/products/:id", requireActor(), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const [row] = await db.select().from(products).where(eq(products.id, id));
  if (!row || row.deletedAt) throw notFound("Ese producto no existe.");
  const costs = await canSeeCosts(c);
  const [item] = await present(db, [row], costs);
  const sups = await db
    .select({ sp: supplierProducts, name: suppliers.name })
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(eq(supplierProducts.productId, id));
  const linked = await db
    .select()
    .from(products)
    .where(and(eq(products.stockBaseId, id), isNull(products.deletedAt)));
  const history = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityType, "product"), eq(auditLog.entityId, id)))
    .orderBy(desc(auditLog.createdAt))
    .limit(100);
  const moves = await db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.productId, row.stockBaseId ?? id))
    .orderBy(desc(stockMovements.createdAt))
    .limit(50);
  const lotRows = row.tracksExpiry
    ? await db
        .select()
        .from(lots)
        .where(and(eq(lots.productId, id), gt(lots.qtyRemaining, 0)))
        .orderBy(asc(lots.expiresOn))
    : [];
  return c.json({
    ...item,
    suppliers: sups.map((s) => ({
      supplierId: s.sp.supplierId,
      name: s.name,
      supplierCode: s.sp.supplierCode,
      isPrimary: s.sp.isPrimary,
      packQty: s.sp.packQty,
      ...(costs ? { costCents: s.sp.costCents } : {}),
    })),
    linked: linked.map((l) => ({
      id: l.id,
      name: l.name,
      factor: l.stockBaseFactor,
      priceCents: l.priceCents,
    })),
    history: history.map((h) => {
      if (costs) return h;
      const strip = (o: unknown) => {
        if (!o || typeof o !== "object") return o;
        const { costCents, avgCostCents, marginBp, ...rest } = o as Record<string, unknown>;
        return rest;
      };
      return { ...h, before: strip(h.before), after: strip(h.after) };
    }),
    movements: moves,
    lots: lotRows,
  });
});

const createProduct = productFields.extend({
  id: z.uuid().optional(),
  name: z.string().min(1).max(120),
  priceCents: z.number().int().nonnegative(),
  barcodes: z.array(z.string().min(3).max(32)).max(20).optional(),
  initialStock: qtySchema.optional(),
});

async function assertCodesFree(db: Db, codes: string[], productId: string) {
  if (!codes.length) return;
  const taken = await db
    .select({ code: barcodes.code, productId: barcodes.productId, name: products.name })
    .from(barcodes)
    .innerJoin(products, eq(products.id, barcodes.productId))
    .where(inArray(barcodes.code, codes));
  const other = taken.find((t) => t.productId !== productId);
  if (other)
    throw conflict(`El código ${other.code} ya es de "${other.name}".`, {
      code: other.code,
      productId: other.productId,
    });
}

async function assertPluFree(db: Db, plu: string | null | undefined, productId: string) {
  if (!plu) return;
  const [other] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.internalCode, plu), isNull(products.deletedAt)));
  if (other && other.id !== productId)
    throw conflict(`El código interno ${plu} ya es de "${other.name}".`);
}

/** Alta de producto (dueño o encargado; el alta rápida del cajero va por la cola). */
catalogRoutes.post("/products", requireActor(), validate("json", createProduct), async (c) => {
  const { id: given, barcodes: codes = [], initialStock, ...changes } = c.req.valid("json");
  const id = given ?? newId();
  const db = c.get("db");
  await assertCodesFree(db, codes, id);
  await assertPluFree(db, changes.internalCode, id);
  if (changes.costCents && changes.marginBp === undefined) {
    changes.marginBp = marginOnCostBp(changes.costCents, changes.priceCents);
  }
  await runDomain(c, (tx, ctx) =>
    upsertProduct(tx, ctx, { id, changes, barcodes: codes, initialStock }),
  );
  const [row] = await db.select().from(products).where(eq(products.id, id));
  const [item] = await present(db, row ? [row] : [], await canSeeCosts(c));
  return c.json(item, 201);
});

const patchProduct = z.object({ changes: productFields, base: productFields.optional() });

/** Edición campo por campo (los campos que no se mandan no se tocan). */
catalogRoutes.patch("/products/:id", requireActor(), validate("json", patchProduct), async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const [row] = await db.select().from(products).where(eq(products.id, id));
  if (!row || row.deletedAt) throw notFound("Ese producto no existe.");
  const { changes, base } = c.req.valid("json");
  if ("costCents" in changes || "priceCents" in changes) {
    const cost = changes.costCents ?? row.costCents;
    const price = changes.priceCents ?? row.priceCents;
    if (cost && changes.marginBp === undefined) changes.marginBp = marginOnCostBp(cost, price);
  }
  await assertPluFree(db, changes.internalCode, id);
  await runDomain(c, (tx, ctx) => upsertProduct(tx, ctx, { id, changes, base }));
  const [next] = await db.select().from(products).where(eq(products.id, id));
  const [item] = await present(db, next ? [next] : [], await canSeeCosts(c));
  return c.json(item);
});

/** Baja: el producto deja de aparecer pero su historia queda. */
catalogRoutes.delete(
  "/products/:id",
  requireActor(),
  requirePermission("change_prices"),
  async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const [row] = await db
      .update(products)
      .set({ deletedAt: new Date(), active: false, updatedAt: new Date() })
      .where(and(eq(products.id, id), isNull(products.deletedAt)))
      .returning();
    if (!row) throw notFound("Ese producto no existe.");
    await auditFrom(c, db, {
      action: "product.deleted",
      entityType: "product",
      entityId: id,
      before: { name: row.name },
    });
    return c.json({ ok: true });
  },
);

const codeBody = z.object({ code: z.string().min(3).max(32) });

catalogRoutes.post(
  "/products/:id/barcodes",
  requireActor(),
  requirePermission("change_prices"),
  validate("json", codeBody),
  async (c) => {
    const id = c.req.param("id");
    const { code } = c.req.valid("json");
    const db = c.get("db");
    const [row] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, id), isNull(products.deletedAt)));
    if (!row) throw notFound("Ese producto no existe.");
    await assertCodesFree(db, [code], id);
    await db.insert(barcodes).values({ id: newId(), productId: id, code }).onConflictDoNothing();
    await auditFrom(c, db, {
      action: "product.barcode_added",
      entityType: "product",
      entityId: id,
      after: { code },
    });
    return c.json({ ok: true }, 201);
  },
);

catalogRoutes.delete(
  "/products/:id/barcodes/:code",
  requireActor(),
  requirePermission("change_prices"),
  async (c) => {
    const { id, code } = c.req.param();
    const db = c.get("db");
    const gone = await db
      .delete(barcodes)
      .where(and(eq(barcodes.productId, id), eq(barcodes.code, code)))
      .returning();
    if (!gone.length) throw notFound("Ese código no es de este producto.");
    await auditFrom(c, db, {
      action: "product.barcode_removed",
      entityType: "product",
      entityId: id,
      before: { code },
    });
    return c.json({ ok: true });
  },
);

// ── Categorías ───────────────────────────────────────────────────────────────

/** Árbol de dos niveles, con ganancia por defecto. */
catalogRoutes.get("/categories", requireActor(), async (c) => {
  const rows = await c
    .get("db")
    .select()
    .from(categories)
    .where(isNull(categories.deletedAt))
    .orderBy(asc(categories.sort), asc(categories.name));
  const counts = await c
    .get("db")
    .select({ categoryId: products.categoryId, n: sql<number>`count(*)::int` })
    .from(products)
    .where(and(isNull(products.deletedAt), isNotNull(products.categoryId)))
    .groupBy(products.categoryId);
  const n = new Map(counts.map((x) => [x.categoryId, x.n]));
  const parents = rows.filter((r) => !r.parentId);
  return c.json(
    parents.map((p) => ({
      ...p,
      products: n.get(p.id) ?? 0,
      children: rows
        .filter((r) => r.parentId === p.id)
        .map((ch) => ({ ...ch, products: n.get(ch.id) ?? 0 })),
    })),
  );
});

const categoryBody = z.object({
  name: z.string().min(1).max(60),
  parentId: z.uuid().nullable().optional(),
  defaultMarginBp: z.number().int().min(0).max(100000).nullable().optional(),
  ageRestricted: z.boolean().optional(),
  tracksExpiry: z.boolean().optional(),
  sort: z.number().int().optional(),
});

async function assertParent(db: Db, parentId: string | null | undefined, selfId?: string) {
  if (!parentId) return;
  if (parentId === selfId) throw conflict("Una categoría no puede ser su propia madre.");
  const [p] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, parentId), isNull(categories.deletedAt)));
  if (!p) throw notFound("La categoría madre no existe.");
  if (p.parentId)
    throw conflict("Las categorías tienen dos niveles: elegí una categoría principal.");
  if (selfId) {
    const [child] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.parentId, selfId), isNull(categories.deletedAt)))
      .limit(1);
    if (child)
      throw conflict("Esta categoría tiene subcategorías: no puede pasar a ser una de ellas.");
  }
}

catalogRoutes.post(
  "/categories",
  requireActor(),
  requirePermission("change_prices"),
  validate("json", categoryBody),
  async (c) => {
    const body = c.req.valid("json");
    const db = c.get("db");
    await assertParent(db, body.parentId);
    const id = newId();
    await db.insert(categories).values({ id, ...body, parentId: body.parentId ?? null });
    await auditFrom(c, db, {
      action: "category.created",
      entityType: "category",
      entityId: id,
      after: body,
    });
    return c.json({ id, ...body }, 201);
  },
);

catalogRoutes.patch(
  "/categories/:id",
  requireActor(),
  requirePermission("change_prices"),
  validate("json", categoryBody.partial()),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const db = c.get("db");
    const [before] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), isNull(categories.deletedAt)));
    if (!before) throw notFound("Esa categoría no existe.");
    if (body.parentId !== undefined) await assertParent(db, body.parentId, id);
    const [after] = await db
      .update(categories)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();
    const d = diff(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await auditFrom(c, db, {
      action: "category.updated",
      entityType: "category",
      entityId: id,
      ...d,
    });
    return c.json(after);
  },
);

catalogRoutes.delete(
  "/categories/:id",
  requireActor(),
  requirePermission("change_prices"),
  async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const [child] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.parentId, id), isNull(categories.deletedAt)))
      .limit(1);
    if (child) throw conflict("Primero mové o borrá sus subcategorías.");
    const [used] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.categoryId, id), isNull(products.deletedAt)))
      .limit(1);
    if (used)
      throw conflict("Hay productos en esta categoría: cambialos de categoría antes de borrarla.");
    const [row] = await db
      .update(categories)
      .set({ deletedAt: new Date() })
      .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
      .returning();
    if (!row) throw notFound("Esa categoría no existe.");
    await auditFrom(c, db, {
      action: "category.deleted",
      entityType: "category",
      entityId: id,
      before: { name: row.name },
    });
    return c.json({ ok: true });
  },
);
