import {
  addDays,
  arDateTime,
  type DateStr,
  formatMoney,
  orderNumber,
  type PaymentMethodCode,
  todayAR,
  weekday,
} from "@mostrador/shared";
import { and, eq, gt, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  lots,
  products,
  purchaseOrders,
  saleLines,
  salePayments,
  saleReturns,
  sales,
  shifts,
  stockCountLines,
  stockCounts,
  stockMovements,
  supplierInvoices,
  suppliers,
} from "../db/schema/index";
import { expectedCash } from "./cash";

const HOUR = 3_600_000;
const arHour = (d: Date) =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      hour12: false,
    }).format(d),
  ) % 24;

/** Ventas de un día (hora del dispositivo, día argentino): total neto de devoluciones y tickets. */
async function dayTotals(db: Db, day: DateStr) {
  const from = arDateTime(day);
  const to = arDateTime(addDays(day, 1));
  const rows = await db
    .select({
      id: sales.id,
      total: sales.totalCents,
      change: sales.changeCents,
      at: sales.deviceAt,
    })
    .from(sales)
    .where(and(eq(sales.status, "completed"), gte(sales.deviceAt, from), lt(sales.deviceAt, to)));
  const [ret] = await db
    .select({ total: sql<string>`coalesce(sum(${saleReturns.totalCents}), 0)` })
    .from(saleReturns)
    .where(and(gte(saleReturns.deviceAt, from), lt(saleReturns.deviceAt, to)));
  const returns = Number(ret?.total ?? 0);
  const gross = rows.reduce((s, r) => s + r.total, 0);
  return { rows, salesCents: gross - returns, returnsCents: returns, tickets: rows.length };
}

export type Attention = {
  key: string;
  severity: "danger" | "warning" | "info";
  text: string;
  action: string;
  path: string;
};

/** Panel del día del dueño (o del encargado, sin margen si no ve costos). */
export async function dashboard(db: Db, opts: { costs: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  const today = todayAR(now);
  const lastWeek = addDays(today, -7);
  const t = await dayTotals(db, today);
  const prev = await dayTotals(db, lastWeek);
  const ids = t.rows.map((r) => r.id);

  // Medios de pago (el efectivo, sin el vuelto).
  const pays = ids.length
    ? await db.select().from(salePayments).where(inArray(salePayments.saleId, ids))
    : [];
  const change = new Map(t.rows.map((r) => [r.id, r.change]));
  const methods: Partial<Record<PaymentMethodCode, number>> = {};
  for (const p of pays) {
    let amount = p.amountCents;
    if (p.method === "cash") {
      amount -= change.get(p.saleId) ?? 0;
      change.set(p.saleId, 0);
    }
    methods[p.method] = (methods[p.method] ?? 0) + amount;
  }

  // Margen bruto estimado y lo más vendido.
  const lines = ids.length
    ? await db.select().from(saleLines).where(inArray(saleLines.saleId, ids))
    : [];
  let marginCents = 0;
  let costedSalesCents = 0;
  const top = new Map<string, { name: string; qty: number; unit: "unit" | "kg"; cents: number }>();
  for (const l of lines) {
    if (l.kind !== "product") continue;
    if (l.unitCostCents != null) {
      marginCents += l.totalCents - Math.round(l.unitCostCents * l.qty);
      costedSalesCents += l.totalCents;
    }
    const k = l.productId ?? l.description;
    const cur = top.get(k) ?? { name: l.description, qty: 0, unit: l.unit, cents: 0 };
    cur.qty += l.qty;
    cur.cents += l.totalCents;
    top.set(k, cur);
  }

  // Ventas por hora: hoy contra el promedio del mismo día en las últimas 4 semanas.
  const byHour = Array.from({ length: 24 }, () => ({ today: 0, avg: 0 }));
  for (const r of t.rows) {
    const h = byHour[arHour(r.at)];
    if (h) h.today += r.total;
  }
  for (let w = 1; w <= 4; w++) {
    const d = await dayTotals(db, addDays(today, -7 * w));
    for (const r of d.rows) {
      const h = byHour[arHour(r.at)];
      if (h) h.avg += r.total / 4;
    }
  }

  // Efectivo en caja: lo esperado de los turnos abiertos.
  const open = await db.select().from(shifts).where(eq(shifts.status, "open"));
  let cashCents = 0;
  for (const s of open) cashCents += await expectedCash(db, s.id);

  return {
    today,
    numbers: {
      salesCents: t.salesCents,
      vsLastWeekBp:
        prev.salesCents > 0
          ? Math.round(((t.salesCents - prev.salesCents) / prev.salesCents) * 10000)
          : null,
      lastWeekSalesCents: prev.salesCents,
      tickets: t.tickets,
      averageTicketCents: t.tickets ? Math.round(t.salesCents / t.tickets) : 0,
      cashCents,
      ...(opts.costs
        ? {
            marginCents,
            marginBp: costedSalesCents
              ? Math.round((marginCents / costedSalesCents) * 10000)
              : null,
          }
        : {}),
    },
    attention: await attention(db, { costs: opts.costs, now }),
    byHour: byHour.map((h, hour) => ({ hour, todayCents: h.today, avgCents: Math.round(h.avg) })),
    methods,
    top: [...top.values()].sort((a, b) => b.cents - a.cents).slice(0, 5),
    deliveries: await deliveries(db, today),
  };
}

/** "Requiere atención", ordenado por urgencia. */
export async function attention(db: Db, opts: { costs: boolean; now: Date }): Promise<Attention[]> {
  const today = todayAR(opts.now);
  const out: Attention[] = [];
  const [low] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(
      and(
        isNull(products.deletedAt),
        eq(products.active, true),
        eq(products.kind, "product"),
        isNull(products.stockBaseId),
        gt(products.minStock, 0),
        sql`${products.stockQty} < ${products.minStock}`,
      ),
    );
  if (low?.n)
    out.push({
      key: "low_stock",
      severity: "warning",
      text: `${low.n} ${low.n === 1 ? "producto" : "productos"} debajo del mínimo`,
      action: "Armar pedidos",
      path: "/compras/sugerido",
    });

  const [exp] = await db
    .select({ n: sql<number>`count(distinct ${lots.productId})::int` })
    .from(lots)
    .where(and(gt(lots.qtyRemaining, 0), lte(lots.expiresOn, addDays(today, 7))));
  if (exp?.n)
    out.push({
      key: "expiry",
      severity: "warning",
      text: `${exp.n} ${exp.n === 1 ? "producto vence" : "productos vencen"} en 7 días`,
      action: "Ver",
      path: "/productos/vencimientos",
    });

  const late = await db
    .select({ o: purchaseOrders, supplier: suppliers.name })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(
      and(
        eq(purchaseOrders.status, "sent"),
        lt(purchaseOrders.sentAt, new Date(opts.now.getTime() - 24 * HOUR)),
      ),
    );
  for (const { o, supplier } of late) {
    const h = Math.floor((opts.now.getTime() - (o.sentAt?.getTime() ?? 0)) / HOUR);
    out.push({
      key: `order:${o.id}`,
      severity: "warning",
      text: `Pedido a ${supplier} enviado hace ${h} h, sin confirmar`,
      action: "Marcar respuesta",
      path: `/compras/pedidos/${o.id}`,
    });
  }

  if (opts.costs) {
    const due = await db
      .select({ inv: supplierInvoices, supplier: suppliers.name })
      .from(supplierInvoices)
      .innerJoin(suppliers, eq(suppliers.id, supplierInvoices.supplierId))
      .where(
        and(
          ne(supplierInvoices.status, "paid"),
          ne(supplierInvoices.kind, "credit_note"),
          lte(supplierInvoices.dueOn, addDays(today, 1)),
        ),
      );
    for (const { inv, supplier } of due) {
      const pending = inv.amountCents - inv.paidCents;
      if (pending <= 0 || !inv.dueOn) continue;
      const when =
        inv.dueOn < today ? "está vencida" : inv.dueOn === today ? "vence hoy" : "vence mañana";
      out.push({
        key: `invoice:${inv.id}`,
        severity: inv.dueOn < today ? "danger" : "warning",
        text: `Factura de ${supplier} ${when}, ${formatMoney(pending)}`,
        action: "Registrar pago",
        path: "/compras/facturas",
      });
    }
  }

  // Cierres de ayer con diferencia.
  const yFrom = arDateTime(addDays(today, -1));
  const yTo = arDateTime(today);
  const closes = await db
    .select()
    .from(shifts)
    .where(
      and(
        eq(shifts.status, "closed"),
        gte(shifts.closedAt, yFrom),
        lt(shifts.closedAt, yTo),
        ne(shifts.differenceCents, 0),
      ),
    );
  for (const s of closes) {
    const d = s.differenceCents ?? 0;
    out.push({
      key: `close:${s.id}`,
      severity: "danger",
      text: `Cierre de ayer con diferencia de ${d < 0 ? "−" : "+"}${formatMoney(Math.abs(d))}`,
      action: "Ver arqueo",
      path: "/caja/cierres",
    });
  }

  const overdue = await db.execute<{ n: number; cents: string }>(sql`
    with o as (
      select l.customer_id, sum(l.amount_cents - coalesce((select sum(a.amount_cents) from ledger_allocations a where a.charge_id = l.id), 0)) as open
      from customer_ledger l where l.amount_cents > 0 and l.due_on < ${today} group by l.customer_id
    ) select count(*)::int as n, coalesce(sum(open), 0)::text as cents from o where open > 0`);
  const ov = overdue[0];
  if (ov?.n)
    out.push({
      key: "credit_overdue",
      severity: "warning",
      text: `${ov.n} ${ov.n === 1 ? "cliente" : "clientes"} con fiado vencido, ${formatMoney(Number(ov.cents))}`,
      action: "Ver",
      path: "/clientes",
    });

  const [pend] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(stockMovements)
    .where(eq(stockMovements.status, "pending"));
  if (pend?.n)
    out.push({
      key: "adjustments",
      severity: "info",
      text: `${pend.n} ${pend.n === 1 ? "ajuste" : "ajustes"} de stock para aprobar`,
      action: "Revisar",
      path: "/productos/movimientos",
    });

  const rank = { danger: 0, warning: 1, info: 2 } as const;
  return out
    .map((a, i) => ({ a, i }))
    .sort((x, y) => rank[x.a.severity] - rank[y.a.severity] || x.i - y.i)
    .map((x) => x.a);
}

/** Entregas de proveedores esperadas para hoy y mañana. */
async function deliveries(db: Db, today: DateStr) {
  const rows = await db
    .select({ o: purchaseOrders, supplier: suppliers.name })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(
      and(
        inArray(purchaseOrders.status, ["sent", "confirmed", "changed", "partial"]),
        gte(purchaseOrders.expectedOn, today),
        lte(purchaseOrders.expectedOn, addDays(today, 1)),
      ),
    );
  return rows.map(({ o, supplier }) => ({
    id: o.id,
    number: orderNumber(o.number),
    supplier,
    expectedOn: o.expectedOn,
    status: o.status,
    when: o.expectedOn === today ? "hoy" : "mañana",
  }));
}

/** "Tus tareas" del repositor: conteos asignados, recepciones esperadas y vencimientos. */
export async function stockerTasks(db: Db, memberId: string, now = new Date()) {
  const today = todayAR(now);
  const counts = await db
    .select({
      c: stockCounts,
      total: sql<number>`(select count(*)::int from ${stockCountLines} where ${stockCountLines.countId} = ${stockCounts.id})`,
    })
    .from(stockCounts)
    .where(and(eq(stockCounts.assignedTo, memberId), eq(stockCounts.status, "open")));
  const receipts = await db
    .select({ o: purchaseOrders, supplier: suppliers.name })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(
      and(
        inArray(purchaseOrders.status, ["sent", "confirmed", "changed", "partial"]),
        lte(purchaseOrders.expectedOn, addDays(today, 1)),
      ),
    );
  const [exp] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lots)
    .where(and(gt(lots.qtyRemaining, 0), lte(lots.expiresOn, addDays(today, 7))));
  const tasks = [
    ...counts.map(({ c, total }) => ({
      key: `count:${c.id}`,
      text: `Contar ${c.name}`,
      detail: `${total} productos`,
      path: `/productos/conteos/${c.id}`,
    })),
    ...receipts.map(({ o, supplier }) => ({
      key: `receipt:${o.id}`,
      text: `Recibir el pedido ${orderNumber(o.number)} de ${supplier}`,
      detail:
        o.expectedOn === today
          ? "llega hoy"
          : o.expectedOn && o.expectedOn < today
            ? "atrasado"
            : "llega mañana",
      path: `/compras/recepcion?pedido=${o.id}`,
    })),
    ...(exp?.n
      ? [
          {
            key: "expiry",
            text: "Revisar vencimientos",
            detail: `${exp.n} ${exp.n === 1 ? "lote vence" : "lotes vencen"} en 7 días`,
            path: "/productos/vencimientos",
          },
        ]
      : []),
  ];
  return { today, weekday: weekday(today), tasks };
}
