import {
  addDays,
  agingBucket,
  arDateTime,
  DEFAULT_PAYMENTS,
  DEFAULT_PRICING,
  daysIn,
  deltaBp,
  diffDays,
  fixedInRange,
  formatDate,
  METHOD_LABEL,
  type PaymentMethodCode,
  previousRange,
  type Range,
  type Report,
  toDateStr,
  todayAR,
} from "@mostrador/shared";
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  cashMovements,
  categories,
  customerLedger,
  customers,
  fixedExpenses,
  members,
  products,
  purchaseOrders,
  receiptLines,
  receipts,
  registers,
  saleLines,
  salePayments,
  saleReturns,
  sales,
  settings,
  shifts,
  stockMovements,
  supplierProducts,
  suppliers,
} from "../db/schema/index";

const TZ = "America/Argentina/Buenos_Aires";
const bounds = (r: Range) => ({ from: arDateTime(r.from), to: arDateTime(addDays(r.to, 1)) });
const arParts = (d: Date) => {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    p.find((x) => x.type === "weekday")?.value ?? "Sun",
  );
  return { weekday: wd, hour: Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24 };
};
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 10000) : null);

export type ReportOpts = { range: Range; memberId?: string | null; categoryId?: string | null };

async function setting<T>(db: Db, key: string, def: T): Promise<T> {
  const [s] = await db.select().from(settings).where(eq(settings.key, key));
  return { ...def, ...((s?.value as object) ?? {}) } as T;
}

/** Ventas del rango con sus líneas (efectivas: sin lo devuelto). */
async function soldIn(db: Db, o: ReportOpts) {
  const b = bounds(o.range);
  const rows = await db
    .select()
    .from(sales)
    .where(
      and(
        eq(sales.status, "completed"),
        gte(sales.deviceAt, b.from),
        lt(sales.deviceAt, b.to),
        o.memberId ? eq(sales.memberId, o.memberId) : undefined,
      ),
    );
  const ids = rows.map((r) => r.id);
  const lines = ids.length
    ? await db.select().from(saleLines).where(inArray(saleLines.saleId, ids))
    : [];
  const [ret] = await db
    .select({ t: sql<string>`coalesce(sum(${saleReturns.totalCents}), 0)` })
    .from(saleReturns)
    .where(
      and(
        gte(saleReturns.deviceAt, b.from),
        lt(saleReturns.deviceAt, b.to),
        o.memberId ? eq(saleReturns.memberId, o.memberId) : undefined,
      ),
    );
  const eff = lines.map((l) => {
    const keep = l.qty ? (l.qty - l.returnedQty) / l.qty : 1;
    return { ...l, effQty: l.qty - l.returnedQty, effTotal: Math.round(l.totalCents * keep) };
  });
  return {
    sales: rows,
    lines: eff,
    returnsCents: Number(ret?.t ?? 0),
    totalCents: rows.reduce((s, r) => s + r.totalCents, 0) - Number(ret?.t ?? 0),
  };
}

async function categoryTree(db: Db) {
  const cats = await db.select().from(categories);
  const name = (id: string | null) => cats.find((c) => c.id === id)?.name ?? "Sin categoría";
  const top = (id: string | null): string | null => {
    const c = cats.find((x) => x.id === id);
    return c ? (c.parentId ? top(c.parentId) : c.id) : null;
  };
  const within = (id: string | null, root: string) => {
    let c = cats.find((x) => x.id === id);
    while (c) {
      if (c.id === root) return true;
      c = cats.find((x) => x.id === c?.parentId);
    }
    return false;
  };
  return { cats, name, top, within };
}

// ── Ventas ───────────────────────────────────────────────────────────────────

export async function salesReport(db: Db, o: ReportOpts): Promise<Report> {
  const tree = await categoryTree(db);
  const now = await soldIn(db, o);
  const prev = await soldIn(db, { ...o, range: previousRange(o.range) });
  const lines = o.categoryId
    ? now.lines.filter((l) => tree.within(l.categoryId, o.categoryId ?? ""))
    : now.lines;
  const total = o.categoryId ? lines.reduce((s, l) => s + l.effTotal, 0) : now.totalCents;
  const prevTotal = o.categoryId
    ? prev.lines
        .filter((l) => tree.within(l.categoryId, o.categoryId ?? ""))
        .reduce((s, l) => s + l.effTotal, 0)
    : prev.totalCents;

  // Por día contra el período anterior (alineados por posición).
  const days = daysIn(o.range);
  const pRange = previousRange(o.range);
  const byDay = (list: typeof now.sales, start: string) => {
    const out = new Array(days).fill(0) as number[];
    for (const s of list) {
      const i = diffDays(start, toDateStr(s.deviceAt));
      if (i >= 0 && i < days) out[i] = (out[i] ?? 0) + s.totalCents;
    }
    return out;
  };
  const d1 = byDay(now.sales, o.range.from);
  const d0 = byDay(prev.sales, pRange.from);
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0) as number[]);
  for (const s of now.sales) {
    const { weekday, hour } = arParts(s.deviceAt);
    const row = grid[weekday];
    if (row) row[hour] = (row[hour] ?? 0) + s.totalCents;
  }

  const agg = <K extends string>(key: (l: (typeof lines)[number]) => K | null) => {
    const m = new Map<K, { qty: number; total: number }>();
    for (const l of lines) {
      const k = key(l);
      if (k == null) continue;
      const cur = m.get(k) ?? { qty: 0, total: 0 };
      cur.qty += l.effQty;
      cur.total += l.effTotal;
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  };
  const byCat = agg((l) =>
    o.categoryId ? (l.categoryId ?? "none") : (tree.top(l.categoryId) ?? "none"),
  );
  const byProduct = agg((l) => l.description);

  const team = await db.select({ id: members.id, name: members.name }).from(members);
  const byCashier = new Map<string, { tickets: number; total: number }>();
  for (const s of now.sales) {
    const cur = byCashier.get(s.memberId) ?? { tickets: 0, total: 0 };
    cur.tickets++;
    cur.total += s.totalCents;
    byCashier.set(s.memberId, cur);
  }
  const pays = now.sales.length
    ? await db
        .select()
        .from(salePayments)
        .where(
          inArray(
            salePayments.saleId,
            now.sales.map((s) => s.id),
          ),
        )
    : [];
  const change = new Map(now.sales.map((s) => [s.id, s.changeCents]));
  const byMethod = new Map<PaymentMethodCode, number>();
  for (const p of pays) {
    let a = p.amountCents;
    if (p.method === "cash") {
      a -= change.get(p.saleId) ?? 0;
      change.set(p.saleId, 0);
    }
    byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + a);
  }
  const methodTotal = [...byMethod.values()].reduce((a, b) => a + b, 0);
  const tickets = now.sales.length;

  return {
    question: "¿Cuánto vendí y cuándo?",
    headline: {
      label: "Ventas",
      value: total,
      kind: "money",
      previous: prevTotal,
      deltaBp: deltaBp(total, prevTotal),
    },
    stats: [
      { label: "Tickets", value: tickets, kind: "int" },
      {
        label: "Ticket promedio",
        value: tickets ? Math.round(now.totalCents / tickets) : 0,
        kind: "money",
      },
      { label: "Devoluciones", value: now.returnsCents, kind: "money" },
    ],
    chart: {
      kind: "bars",
      label: "Por día, contra el período anterior",
      points: d1.map((v, i) => ({
        label: formatDate(addDays(o.range.from, i)).slice(0, 5),
        value: v,
        previous: d0[i] ?? 0,
      })),
      grid,
    },
    tables: [
      {
        key: "categories",
        title: o.categoryId ? `Dentro de ${tree.name(o.categoryId)}` : "Por categoría",
        columns: [
          { key: "name", label: "Categoría" },
          { key: "total", label: "Vendido", kind: "money" },
          { key: "share", label: "% del total", kind: "percent" },
        ],
        rows: byCat.map(([id, v]) => ({
          id,
          name: id === "none" ? "Sin categoría" : tree.name(id),
          total: v.total,
          share: pct(v.total, total),
        })),
        drill: o.categoryId ? undefined : { column: "id", param: "categoryId" },
      },
      {
        key: "products",
        title: "Por producto",
        columns: [
          { key: "name", label: "Producto" },
          { key: "qty", label: "Cantidad", kind: "qty" },
          { key: "total", label: "Vendido", kind: "money" },
        ],
        rows: byProduct
          .slice(0, 100)
          .map(([name, v]) => ({ name, qty: Math.round(v.qty * 1000) / 1000, total: v.total })),
      },
      {
        key: "cashiers",
        title: "Por cajero",
        columns: [
          { key: "name", label: "Cajero" },
          { key: "tickets", label: "Tickets", kind: "int" },
          { key: "total", label: "Vendido", kind: "money" },
          { key: "avg", label: "Ticket promedio", kind: "money" },
        ],
        rows: [...byCashier.entries()]
          .sort((a, b) => b[1].total - a[1].total)
          .map(([id, v]) => ({
            name: team.find((t) => t.id === id)?.name ?? "—",
            tickets: v.tickets,
            total: v.total,
            avg: Math.round(v.total / v.tickets),
          })),
      },
      {
        key: "methods",
        title: "Por medio de pago",
        columns: [
          { key: "name", label: "Medio" },
          { key: "total", label: "Cobrado", kind: "money" },
          { key: "share", label: "%", kind: "percent" },
        ],
        rows: [...byMethod.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([m, v]) => ({
            name: m === "account" ? "Fiado" : METHOD_LABEL[m],
            total: v,
            share: pct(v, methodTotal),
          })),
      },
    ],
  };
}

// ── Rentabilidad ─────────────────────────────────────────────────────────────

async function commissions(db: Db, saleIds: string[]) {
  if (!saleIds.length) return 0;
  const pay = await setting(db, "payments", DEFAULT_PAYMENTS);
  const pays = await db.select().from(salePayments).where(inArray(salePayments.saleId, saleIds));
  return pays.reduce(
    (s, p) => s + Math.round((p.amountCents * (pay.methods[p.method]?.feeBp ?? 0)) / 10000),
    0,
  );
}

export async function profitabilityReport(db: Db, o: ReportOpts): Promise<Report> {
  const tree = await categoryTree(db);
  const now = await soldIn(db, o);
  const prev = await soldIn(db, { ...o, range: previousRange(o.range) });
  const margin = (ls: typeof now.lines) =>
    ls
      .filter((l) => l.kind === "product" && l.unitCostCents != null)
      .reduce((s, l) => s + l.effTotal - Math.round((l.unitCostCents ?? 0) * l.effQty), 0);
  const costed = now.lines.filter(
    (l) =>
      l.kind === "product" &&
      l.unitCostCents != null &&
      (!o.categoryId || tree.within(l.categoryId, o.categoryId)),
  );
  const revenue = costed.reduce((s, l) => s + l.effTotal, 0);
  const m = margin(costed);
  const noCost = now.lines
    .filter((l) => l.kind === "product" && l.unitCostCents == null)
    .reduce((s, l) => s + l.effTotal, 0);
  const fees = await commissions(
    db,
    now.sales.map((s) => s.id),
  );

  const links = await db
    .select({
      productId: supplierProducts.productId,
      supplierId: supplierProducts.supplierId,
      primary: supplierProducts.isPrimary,
      name: suppliers.name,
    })
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId));
  const supplierOf = (pid: string | null) => {
    const l = links.filter((x) => x.productId === pid);
    return (l.find((x) => x.primary) ?? l[0])?.name ?? "Sin proveedor";
  };
  const group = (key: (l: (typeof costed)[number]) => string) => {
    const g = new Map<string, { revenue: number; cost: number }>();
    for (const l of costed) {
      const k = key(l);
      const cur = g.get(k) ?? { revenue: 0, cost: 0 };
      cur.revenue += l.effTotal;
      cur.cost += Math.round((l.unitCostCents ?? 0) * l.effQty);
      g.set(k, cur);
    }
    return [...g.entries()]
      .map(([name, v]) => ({
        name,
        revenue: v.revenue,
        cost: v.cost,
        margin: v.revenue - v.cost,
        marginPct: pct(v.revenue - v.cost, v.revenue),
      }))
      .sort((a, b) => b.margin - a.margin);
  };
  const byProduct = new Map<string, string>();
  for (const l of costed) if (l.productId) byProduct.set(l.productId, l.description);

  // Catálogo: lo que está debajo de la ganancia mínima o pierde plata.
  const pricing = await setting(db, "pricing", DEFAULT_PRICING);
  const catalog = await db
    .select()
    .from(products)
    .where(
      and(isNull(products.deletedAt), eq(products.active, true), eq(products.kind, "product")),
    );
  const review = catalog
    .filter((p) => p.costCents != null && p.costCents > 0)
    .map((p) => ({
      name: p.name,
      cost: p.costCents ?? 0,
      price: p.priceCents,
      marginPct: Math.round(((p.priceCents - (p.costCents ?? 0)) / (p.costCents ?? 1)) * 10000),
    }))
    .filter((p) => p.marginPct < pricing.minMarginBp)
    .sort((a, b) => a.marginPct - b.marginPct)
    .map((p) => ({ ...p, status: p.price < p.cost ? "Pierde plata" : "Debajo del mínimo" }));

  const cols = [
    { key: "name", label: "Nombre" },
    { key: "revenue", label: "Vendido", kind: "money" as const },
    { key: "cost", label: "Costo", kind: "money" as const },
    { key: "margin", label: "Margen", kind: "money" as const },
    { key: "marginPct", label: "Margen %", kind: "percent" as const },
  ];
  const prevMargin = margin(
    prev.lines.filter((l) => !o.categoryId || tree.within(l.categoryId, o.categoryId)),
  );
  return {
    question: "¿Dónde gano y dónde pierdo?",
    headline: {
      label: "Margen bruto",
      value: m,
      kind: "money",
      previous: prevMargin,
      deltaBp: deltaBp(m, prevMargin),
      hint: revenue
        ? `${((m / revenue) * 100).toFixed(1).replace(".", ",")} % de lo vendido con costo`
        : undefined,
    },
    stats: [
      { label: "Margen %", value: pct(m, revenue) ?? 0, kind: "percent" },
      { label: "Comisiones de medios de pago", value: fees, kind: "money" },
      { label: "Margen después de comisiones", value: m - fees, kind: "money" },
      { label: "Vendido sin costo cargado", value: noCost, kind: "money" },
    ],
    tables: [
      { key: "products", title: "Por producto", columns: cols, rows: group((l) => l.description) },
      {
        key: "categories",
        title: "Por categoría",
        columns: cols,
        rows: group((l) => tree.name(tree.top(l.categoryId))),
      },
      {
        key: "suppliers",
        title: "Por proveedor",
        columns: cols,
        rows: group((l) => supplierOf(l.productId)),
      },
      {
        key: "review",
        title: "Para revisar: debajo de la ganancia mínima o pierden plata",
        columns: [
          { key: "name", label: "Producto" },
          { key: "cost", label: "Costo", kind: "money" },
          { key: "price", label: "Precio", kind: "money" },
          { key: "marginPct", label: "Ganancia", kind: "percent" },
          { key: "status", label: "Estado" },
        ],
        rows: review,
      },
    ],
  };
}

// ── Stock ────────────────────────────────────────────────────────────────────

export async function stockReport(db: Db, o: ReportOpts): Promise<Report> {
  const today = todayAR();
  const catalog = await db
    .select()
    .from(products)
    .where(
      and(
        isNull(products.deletedAt),
        eq(products.active, true),
        eq(products.kind, "product"),
        isNull(products.stockBaseId),
      ),
    );
  const since28 = arDateTime(addDays(today, -27));
  const sold = await db
    .select({
      productId: stockMovements.productId,
      qty: sql<string>`sum(-${stockMovements.qty})`,
      last: sql<Date>`max(${stockMovements.createdAt})`,
    })
    .from(stockMovements)
    .where(and(eq(stockMovements.kind, "sale"), gte(stockMovements.createdAt, since28)))
    .groupBy(stockMovements.productId);
  const lastSale = await db
    .select({
      productId: stockMovements.productId,
      last: sql<string>`max(${stockMovements.createdAt})`,
    })
    .from(stockMovements)
    .where(eq(stockMovements.kind, "sale"))
    .groupBy(stockMovements.productId);
  const lastMove = await db
    .select({
      productId: stockMovements.productId,
      last: sql<string>`max(${stockMovements.createdAt})`,
    })
    .from(stockMovements)
    .groupBy(stockMovements.productId);
  const daily = new Map(sold.map((s) => [s.productId, Number(s.qty) / 28]));
  const atCost = catalog.reduce(
    (s, p) => s + Math.round(Math.max(0, p.stockQty) * (p.costCents ?? 0)),
    0,
  );
  const atPrice = catalog.reduce(
    (s, p) => s + Math.round(Math.max(0, p.stockQty) * p.priceCents),
    0,
  );

  const coverage = catalog
    .filter((p) => (daily.get(p.id) ?? 0) > 0 && p.stockQty > 0)
    .map((p) => ({
      name: p.name,
      stock: p.stockQty,
      daily: Math.round((daily.get(p.id) ?? 0) * 100) / 100,
      days: Math.floor(p.stockQty / (daily.get(p.id) ?? 1)),
    }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 100);

  const idle = catalog
    .filter((p) => p.stockQty > 0)
    .map((p) => {
      const ls = lastSale.find((x) => x.productId === p.id)?.last;
      const ref = ls ? new Date(ls) : p.createdAt;
      return {
        name: p.name,
        stock: p.stockQty,
        value: Math.round(p.stockQty * (p.costCents ?? 0)),
        days: diffDays(toDateStr(ref), today),
      };
    })
    .filter((x) => x.days >= 30)
    .sort((a, b) => b.days - a.days)
    .map((x) => ({
      ...x,
      bucket: x.days >= 90 ? "90 días o más" : x.days >= 60 ? "60 días" : "30 días",
    }));

  const outs = catalog
    .filter((p) => p.stockQty <= 0 && (daily.get(p.id) ?? 0) > 0)
    .map((p) => {
      const lm = lastMove.find((x) => x.productId === p.id)?.last;
      const days = Math.min(30, Math.max(1, lm ? diffDays(toDateStr(new Date(lm)), today) : 1));
      return {
        name: p.name,
        daily: Math.round((daily.get(p.id) ?? 0) * 100) / 100,
        days,
        lost: Math.round((daily.get(p.id) ?? 0) * days * p.priceCents),
      };
    })
    .sort((a, b) => b.lost - a.lost);

  const b = bounds(o.range);
  const waste = await db
    .select({
      reason: stockMovements.reason,
      cents: sql<string>`sum(-${stockMovements.qty} * coalesce(${products.costCents}, 0))`,
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .where(
      and(
        inArray(stockMovements.kind, ["waste", "adjustment"]),
        sql`${stockMovements.qty} < 0`,
        eq(stockMovements.status, "applied"),
        gte(stockMovements.createdAt, b.from),
        lt(stockMovements.createdAt, b.to),
      ),
    )
    .groupBy(stockMovements.reason);
  const REASON: Record<string, string> = {
    waste: "Merma",
    breakage: "Rotura",
    expired: "Vencido",
    missing: "Faltante",
    internal_use: "Consumo interno",
    load_error: "Error de carga",
    supplier_return: "Devuelto al proveedor",
    other: "Otro",
  };

  return {
    question: "¿Cuánta plata tengo en la góndola?",
    headline: { label: "Stock a costo", value: atCost, kind: "money" },
    stats: [
      { label: "Stock a precio de venta", value: atPrice, kind: "money" },
      {
        label: "Productos con stock",
        value: catalog.filter((p) => p.stockQty > 0).length,
        kind: "int",
      },
      { label: "Sin stock y con venta", value: outs.length, kind: "int" },
      {
        label: "Venta perdida estimada",
        value: outs.reduce((s, x) => s + x.lost, 0),
        kind: "money",
      },
    ],
    tables: [
      {
        key: "coverage",
        title: "Días de cobertura",
        columns: [
          { key: "name", label: "Producto" },
          { key: "stock", label: "Stock", kind: "qty" },
          { key: "daily", label: "Venta por día", kind: "qty" },
          { key: "days", label: "Días", kind: "int" },
        ],
        rows: coverage,
      },
      {
        key: "idle",
        title: "Sin movimiento en 30, 60 o 90 días",
        columns: [
          { key: "name", label: "Producto" },
          { key: "stock", label: "Stock", kind: "qty" },
          { key: "value", label: "A costo", kind: "money" },
          { key: "days", label: "Días sin venta", kind: "int" },
          { key: "bucket", label: "Tramo" },
        ],
        rows: idle,
      },
      {
        key: "outs",
        title: "Quiebres de stock",
        columns: [
          { key: "name", label: "Producto" },
          { key: "daily", label: "Venta por día", kind: "qty" },
          { key: "days", label: "Días sin stock", kind: "int" },
          { key: "lost", label: "Venta perdida", kind: "money" },
        ],
        rows: outs,
      },
      {
        key: "waste",
        title: "Mermas por motivo",
        columns: [
          { key: "name", label: "Motivo" },
          { key: "cents", label: "A costo", kind: "money" },
        ],
        rows: waste
          .map((w) => ({
            name: REASON[w.reason ?? "other"] ?? w.reason ?? "Otro",
            cents: Math.round(Number(w.cents)),
          }))
          .sort((a, z) => (z.cents as number) - (a.cents as number)),
      },
    ],
  };
}

// ── Caja ─────────────────────────────────────────────────────────────────────

export async function cashReport(db: Db, o: ReportOpts): Promise<Report> {
  const b = bounds(o.range);
  const closes = await db
    .select({ s: shifts, cashier: members.name, register: registers.name })
    .from(shifts)
    .innerJoin(members, eq(members.id, shifts.memberId))
    .innerJoin(registers, eq(registers.id, shifts.registerId))
    .where(
      and(eq(shifts.status, "closed"), gte(shifts.closedAt, b.from), lt(shifts.closedAt, b.to)),
    )
    .orderBy(shifts.closedAt);
  const moves = await db
    .select({ m: cashMovements })
    .from(cashMovements)
    .where(
      and(
        inArray(cashMovements.kind, ["expense", "withdrawal"]),
        gte(cashMovements.createdAt, b.from),
        lt(cashMovements.createdAt, b.to),
      ),
    );
  const totalDiff = closes.reduce((s, c) => s + (c.s.differenceCents ?? 0), 0);
  const byCashier = new Map<string, { closes: number; diff: number }>();
  for (const c of closes) {
    const cur = byCashier.get(c.cashier) ?? { closes: 0, diff: 0 };
    cur.closes++;
    cur.diff += c.s.differenceCents ?? 0;
    byCashier.set(c.cashier, cur);
  }
  const CAT: Record<string, string> = {
    cleaning: "Limpieza",
    freight: "Flete",
    maintenance: "Mantenimiento",
    salary_advance: "Adelanto de sueldo",
    other: "Otros",
  };
  const exp = new Map<string, number>();
  let withdrawals = 0;
  for (const { m } of moves) {
    if (m.kind === "withdrawal") withdrawals += -m.amountCents;
    else
      exp.set(
        CAT[m.category ?? "other"] ?? "Otros",
        (exp.get(CAT[m.category ?? "other"] ?? "Otros") ?? 0) - m.amountCents,
      );
  }
  return {
    question: "¿Cuadran los turnos?",
    headline: {
      label: "Diferencia acumulada",
      value: totalDiff,
      kind: "money",
      hint: `${closes.length} cierres`,
    },
    stats: [
      { label: "Cierres", value: closes.length, kind: "int" },
      {
        label: "Con diferencia",
        value: closes.filter((c) => (c.s.differenceCents ?? 0) !== 0).length,
        kind: "int",
      },
      {
        label: "Gastos de caja",
        value: [...exp.values()].reduce((a, z) => a + z, 0),
        kind: "money",
      },
      { label: "Retiros", value: withdrawals, kind: "money" },
    ],
    tables: [
      {
        key: "closes",
        title: "Cierres por turno",
        columns: [
          { key: "date", label: "Fecha", kind: "date" },
          { key: "register", label: "Caja" },
          { key: "cashier", label: "Cajero" },
          { key: "expected", label: "Esperado", kind: "money" },
          { key: "counted", label: "Contado", kind: "money" },
          { key: "diff", label: "Diferencia", kind: "money" },
        ],
        rows: closes.map((c) => ({
          date: c.s.closedAt ? toDateStr(c.s.closedAt) : null,
          register: c.register,
          cashier: c.cashier,
          expected: c.s.expectedCashCents,
          counted: c.s.countedCashCents,
          diff: c.s.differenceCents,
        })),
      },
      {
        key: "cashiers",
        title: "Diferencias por cajero",
        columns: [
          { key: "name", label: "Cajero" },
          { key: "closes", label: "Cierres", kind: "int" },
          { key: "diff", label: "Diferencia acumulada", kind: "money" },
        ],
        rows: [...byCashier.entries()].map(([name, v]) => ({
          name,
          closes: v.closes,
          diff: v.diff,
        })),
      },
      {
        key: "expenses",
        title: "Gastos por categoría",
        columns: [
          { key: "name", label: "Categoría" },
          { key: "cents", label: "Monto", kind: "money" },
        ],
        rows: [...exp.entries()]
          .map(([name, cents]) => ({ name, cents }))
          .sort((a, z) => z.cents - a.cents),
      },
    ],
  };
}

// ── Compras ──────────────────────────────────────────────────────────────────

export async function purchasesReport(db: Db, o: ReportOpts): Promise<Report> {
  const b = bounds(o.range);
  const recs = await db
    .select({ r: receipts, supplier: suppliers.name })
    .from(receipts)
    .leftJoin(suppliers, eq(suppliers.id, receipts.supplierId))
    .where(and(gte(receipts.receivedAt, b.from), lt(receipts.receivedAt, b.to)));
  const bySupplier = new Map<string, { count: number; total: number }>();
  for (const { r, supplier } of recs) {
    const k = supplier ?? "Sin proveedor";
    const cur = bySupplier.get(k) ?? { count: 0, total: 0 };
    cur.count++;
    cur.total += r.totalCents;
    bySupplier.set(k, cur);
  }
  const total = recs.reduce((s, x) => s + x.r.totalCents, 0);
  const prevB = bounds(previousRange(o.range));
  const [prev] = await db
    .select({ t: sql<string>`coalesce(sum(${receipts.totalCents}), 0)` })
    .from(receipts)
    .where(and(gte(receipts.receivedAt, prevB.from), lt(receipts.receivedAt, prevB.to)));

  // Aumento de costos por proveedor en 30 y 90 días (promedio de las líneas que cambiaron).
  const increases = async (days: number) => {
    const rows = await db
      .select({
        supplier: suppliers.name,
        prev: receiptLines.previousCostCents,
        cost: receiptLines.unitCostCents,
      })
      .from(receiptLines)
      .innerJoin(receipts, eq(receipts.id, receiptLines.receiptId))
      .innerJoin(suppliers, eq(suppliers.id, receipts.supplierId))
      .where(
        and(
          gte(receipts.receivedAt, new Date(Date.now() - days * 86_400_000)),
          sql`${receiptLines.previousCostCents} > 0`,
          sql`${receiptLines.unitCostCents} is not null`,
        ),
      );
    const m = new Map<string, number[]>();
    for (const r of rows)
      m.set(r.supplier, [
        ...(m.get(r.supplier) ?? []),
        ((r.cost ?? 0) - (r.prev ?? 0)) / (r.prev ?? 1),
      ]);
    return new Map(
      [...m.entries()].map(([k, v]) => [
        k,
        Math.round((v.reduce((a, z) => a + z, 0) / v.length) * 10000),
      ]),
    );
  };
  const inc30 = await increases(30);
  const inc90 = await increases(90);
  const names = new Set([...inc30.keys(), ...inc90.keys()]);

  // Pedido contra entregado y demoras.
  const orders = await db
    .select({
      o: purchaseOrders,
      supplier: suppliers.name,
      ordered: sql<string>`(select coalesce(sum(coalesce(l.qty_confirmed, l.qty_ordered)), 0) from purchase_order_lines l where l.order_id = ${purchaseOrders.id})`,
      received: sql<string>`(select coalesce(sum(coalesce(l.qty_received, 0)), 0) from purchase_order_lines l where l.order_id = ${purchaseOrders.id})`,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(
      and(
        inArray(purchaseOrders.status, ["partial", "received", "closed"]),
        gte(purchaseOrders.receivedAt, b.from),
        lt(purchaseOrders.receivedAt, b.to),
      ),
    );

  return {
    question: "¿A quién le compro y cuánto aumenta?",
    headline: {
      label: "Compras",
      value: total,
      kind: "money",
      previous: Number(prev?.t ?? 0),
      deltaBp: deltaBp(total, Number(prev?.t ?? 0)),
    },
    stats: [{ label: "Recepciones", value: recs.length, kind: "int" }],
    tables: [
      {
        key: "suppliers",
        title: "Compras por proveedor",
        columns: [
          { key: "name", label: "Proveedor" },
          { key: "count", label: "Recepciones", kind: "int" },
          { key: "total", label: "Comprado", kind: "money" },
          { key: "share", label: "%", kind: "percent" },
        ],
        rows: [...bySupplier.entries()]
          .sort((a, z) => z[1].total - a[1].total)
          .map(([name, v]) => ({
            name,
            count: v.count,
            total: v.total,
            share: pct(v.total, total),
          })),
      },
      {
        key: "increases",
        title: "Aumento de costos",
        columns: [
          { key: "name", label: "Proveedor" },
          { key: "d30", label: "30 días", kind: "percent" },
          { key: "d90", label: "90 días", kind: "percent" },
        ],
        rows: [...names].map((n) => ({
          name: n,
          d30: inc30.get(n) ?? null,
          d90: inc90.get(n) ?? null,
        })),
      },
      {
        key: "fill",
        title: "Pedido contra entregado",
        columns: [
          { key: "order", label: "Pedido" },
          { key: "name", label: "Proveedor" },
          { key: "fill", label: "Entregado", kind: "percent" },
          { key: "delay", label: "Demora (días)", kind: "int" },
        ],
        rows: orders.map((x) => ({
          order: String(x.o.number).padStart(4, "0"),
          name: x.supplier,
          fill: pct(Number(x.received), Number(x.ordered)),
          delay:
            x.o.expectedOn && x.o.receivedAt
              ? Math.max(0, diffDays(x.o.expectedOn, toDateStr(x.o.receivedAt)))
              : null,
        })),
      },
    ],
  };
}

// ── Fiado ────────────────────────────────────────────────────────────────────

export async function creditReport(db: Db): Promise<Report> {
  const today = todayAR();
  const charges = await db
    .select({
      id: customerLedger.id,
      customerId: customerLedger.customerId,
      amount: customerLedger.amountCents,
      at: customerLedger.createdAt,
      dueOn: customerLedger.dueOn,
      allocated: sql<string>`coalesce((select sum(a.amount_cents) from ledger_allocations a where a.charge_id = customer_ledger.id), 0)`,
    })
    .from(customerLedger)
    .where(sql`${customerLedger.amountCents} > 0`);
  const buckets = { "0-30": 0, "31-60": 0, "60+": 0 };
  const per = new Map<string, { open: number; oldest: number; overdue: number }>();
  for (const c of charges) {
    const open = c.amount - Number(c.allocated);
    if (open <= 0) continue;
    const days = diffDays(toDateStr(c.at), today);
    buckets[agingBucket(days)] += open;
    const cur = per.get(c.customerId) ?? { open: 0, oldest: 0, overdue: 0 };
    cur.open += open;
    cur.oldest = Math.max(cur.oldest, days);
    if (c.dueOn && c.dueOn < today) cur.overdue += open;
    per.set(c.customerId, cur);
  }
  const cs = await db
    .select({
      id: customers.id,
      name: customers.name,
      balance: customers.balanceCents,
      limit: customers.creditLimitCents,
    })
    .from(customers);
  const total = buckets["0-30"] + buckets["31-60"] + buckets["60+"];
  return {
    question: "¿Cuánta plata tengo en la calle?",
    headline: { label: "Fiado en la calle", value: total, kind: "money" },
    stats: [
      { label: "Clientes con deuda", value: per.size, kind: "int" },
      {
        label: "Vencido",
        value: [...per.values()].reduce((s, x) => s + x.overdue, 0),
        kind: "money",
      },
    ],
    chart: {
      kind: "bars",
      label: "Por antigüedad",
      points: [
        { label: "0 a 30 días", value: buckets["0-30"] },
        { label: "31 a 60 días", value: buckets["31-60"] },
        { label: "Más de 60 días", value: buckets["60+"] },
      ],
    },
    tables: [
      {
        key: "aging",
        title: "Deuda por antigüedad",
        columns: [
          { key: "name", label: "Antigüedad" },
          { key: "cents", label: "Deuda", kind: "money" },
          { key: "share", label: "%", kind: "percent" },
        ],
        rows: [
          ["0 a 30 días", buckets["0-30"]],
          ["31 a 60 días", buckets["31-60"]],
          ["Más de 60 días", buckets["60+"]],
        ].map(([name, cents]) => ({
          name: name as string,
          cents: cents as number,
          share: pct(cents as number, total),
        })),
      },
      {
        key: "customers",
        title: "Clientes con mayor deuda",
        columns: [
          { key: "name", label: "Cliente" },
          { key: "open", label: "Deuda", kind: "money" },
          { key: "limit", label: "Límite", kind: "money" },
          { key: "oldest", label: "Días de la más vieja", kind: "int" },
          { key: "overdue", label: "Vencido", kind: "money" },
        ],
        rows: [...per.entries()]
          .sort((a, z) => z[1].open - a[1].open)
          .map(([id, v]) => ({
            name: cs.find((c) => c.id === id)?.name ?? "—",
            open: v.open,
            limit: cs.find((c) => c.id === id)?.limit ?? null,
            oldest: v.oldest,
            overdue: v.overdue,
          })),
      },
    ],
  };
}

// ── Resultado del mes ────────────────────────────────────────────────────────

async function resultOf(db: Db, range: Range) {
  const s = await soldIn(db, { range });
  const cogs = s.lines
    .filter((l) => l.kind === "product" && l.unitCostCents != null)
    .reduce((t, l) => t + Math.round((l.unitCostCents ?? 0) * l.effQty), 0);
  const noCost = s.lines
    .filter((l) => l.kind === "product" && l.unitCostCents == null)
    .reduce((t, l) => t + l.effTotal, 0);
  const fees = await commissions(
    db,
    s.sales.map((x) => x.id),
  );
  const b = bounds(range);
  const [exp] = await db
    .select({ t: sql<string>`coalesce(sum(-${cashMovements.amountCents}), 0)` })
    .from(cashMovements)
    .where(
      and(
        eq(cashMovements.kind, "expense"),
        gte(cashMovements.createdAt, b.from),
        lt(cashMovements.createdAt, b.to),
      ),
    );
  const fixed = await db
    .select()
    .from(fixedExpenses)
    .where(and(eq(fixedExpenses.active, true), isNull(fixedExpenses.deletedAt)));
  const fixedRows = fixed.map((f) => ({
    name: f.name,
    cents: fixedInRange(f.monthlyCents, range),
  }));
  const fixedTotal = fixedRows.reduce((t, f) => t + f.cents, 0);
  const expenses = Number(exp?.t ?? 0);
  return {
    sales: s.totalCents,
    cogs,
    noCost,
    fees,
    expenses,
    fixedRows,
    fixedTotal,
    result: s.totalCents - cogs - fees - expenses - fixedTotal,
  };
}

export async function resultReport(db: Db, o: ReportOpts): Promise<Report> {
  const r = await resultOf(db, o.range);
  const p = await resultOf(db, previousRange(o.range));
  return {
    question: "¿Gané plata este mes?",
    headline: {
      label: r.result >= 0 ? "Ganancia" : "Pérdida",
      value: r.result,
      kind: "money",
      previous: p.result,
      deltaBp: deltaBp(r.result, p.result),
    },
    stats: [
      { label: "Ventas", value: r.sales, kind: "money" },
      { label: "Costo de lo vendido", value: r.cogs, kind: "money" },
      { label: "Gastos", value: r.expenses + r.fixedTotal + r.fees, kind: "money" },
    ],
    tables: [
      {
        key: "statement",
        title: "Cuenta del período",
        columns: [
          { key: "name", label: "Concepto" },
          { key: "cents", label: "Monto", kind: "money" },
          { key: "previous", label: "Período anterior", kind: "money" },
        ],
        rows: [
          { name: "Ventas", cents: r.sales, previous: p.sales },
          { name: "Costo de lo vendido", cents: -r.cogs, previous: -p.cogs },
          { name: "Comisiones de medios de pago", cents: -r.fees, previous: -p.fees },
          { name: "Gastos de caja", cents: -r.expenses, previous: -p.expenses },
          ...r.fixedRows.map((f) => ({
            name: f.name,
            cents: -f.cents,
            previous: -(p.fixedRows.find((x) => x.name === f.name)?.cents ?? 0),
          })),
          { name: "Resultado", cents: r.result, previous: p.result },
          ...(r.noCost
            ? [
                {
                  name: "Vendido sin costo cargado (no entra en el costo)",
                  cents: r.noCost,
                  previous: p.noCost,
                },
              ]
            : []),
        ],
      },
    ],
  };
}

export const REPORTS = {
  sales: salesReport,
  profitability: profitabilityReport,
  stock: stockReport,
  cash: cashReport,
  purchases: purchasesReport,
  credit: (db: Db) => creditReport(db),
  result: resultReport,
} as const;
export type ReportKind = keyof typeof REPORTS;
