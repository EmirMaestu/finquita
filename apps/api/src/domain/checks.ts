import {
  addDays,
  alertFor,
  alertPath,
  DEFAULT_ALERTS,
  formatDate,
  formatMoney,
  orderNumber,
  type Role,
  todayAR,
} from "@mostrador/shared";
import { and, eq, gt, isNull, lt, lte, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  alerts,
  lots,
  members,
  products,
  purchaseOrders,
  pushSubscriptions,
  settings,
  supplierInvoices,
  suppliers,
} from "../db/schema/index";
import { log } from "../lib/log";
import { raiseAlert } from "./alerts";

const HOUR = 3_600_000;

/**
 * Chequeos que corren solos (pg-boss, cada 10 minutos): pedido sin respuesta en 24 h,
 * facturas y lotes por vencer, fiado vencido y avisos pospuestos que vuelven.
 */
export async function runChecks(db: Db, now = new Date()) {
  const today = todayAR(now);
  const out = { orderNoResponse: 0, invoiceDue: 0, expiry: 0, creditOverdue: 0, unsnoozed: 0 };

  // Pedido enviado hace más de 24 h sin confirmación.
  const late = await db
    .select({ o: purchaseOrders, supplier: suppliers.name })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(
      and(
        eq(purchaseOrders.status, "sent"),
        lt(purchaseOrders.sentAt, new Date(now.getTime() - 24 * HOUR)),
      ),
    );
  for (const { o, supplier } of late) {
    const hours = Math.floor((now.getTime() - (o.sentAt?.getTime() ?? now.getTime())) / HOUR);
    await raiseAlert(db, {
      kind: "order_no_response",
      title: `${supplier} no confirmó el pedido ${orderNumber(o.number)}`,
      body: `Lo mandaste hace ${hours} h. Escribile o marcalo como confirmado cuando responda.`,
      refType: "purchase_order",
      refId: o.id,
      dedupeKey: `order_no_response:${o.id}`,
      reopen: false,
    });
    out.orderNoResponse++;
  }

  // Factura de proveedor que vence hoy, mañana o pasado.
  const due = await db
    .select({ inv: supplierInvoices, supplier: suppliers.name })
    .from(supplierInvoices)
    .innerJoin(suppliers, eq(suppliers.id, supplierInvoices.supplierId))
    .where(
      and(
        ne(supplierInvoices.status, "paid"),
        ne(supplierInvoices.kind, "credit_note"),
        lte(supplierInvoices.dueOn, addDays(today, 2)),
      ),
    );
  for (const { inv, supplier } of due) {
    const pending = inv.amountCents - inv.paidCents;
    if (pending <= 0 || !inv.dueOn) continue;
    const when =
      inv.dueOn < today
        ? `venció el ${formatDate(inv.dueOn).slice(0, 5)}`
        : inv.dueOn === today
          ? "vence hoy"
          : inv.dueOn === addDays(today, 1)
            ? "vence mañana"
            : `vence el ${formatDate(inv.dueOn).slice(0, 5)}`;
    await raiseAlert(db, {
      kind: "invoice_due",
      severity: inv.dueOn < today ? "danger" : "warning",
      title: `Factura de ${supplier} ${when}, ${formatMoney(pending)}`,
      body: "Registrá el pago desde Compras > Facturas y pagos.",
      refType: "supplier_invoice",
      refId: inv.id,
      dedupeKey: `invoice_due:${inv.id}`,
      reopen: false,
    });
    out.invoiceDue++;
  }

  // Lotes con stock que vencen en 3 días o menos.
  const expiring = await db
    .select({ l: lots, name: products.name })
    .from(lots)
    .innerJoin(products, eq(products.id, lots.productId))
    .where(and(gt(lots.qtyRemaining, 0), lte(lots.expiresOn, addDays(today, 3))));
  for (const { l, name } of expiring) {
    await raiseAlert(db, {
      kind: "expiry",
      severity: l.expiresOn < today ? "danger" : "warning",
      title: `${name} ${l.expiresOn < today ? "venció" : "vence"} el ${formatDate(l.expiresOn).slice(0, 5)}`,
      body: "Ponelo en oferta, devolvelo o dalo de baja.",
      refType: "lot",
      refId: l.id,
      dedupeKey: `expiry:${l.id}`,
      reopen: false,
    });
    out.expiry++;
  }

  // Fiado vencido: un aviso por cliente.
  const overdue = await db.execute<{ id: string; name: string; overdue: string }>(sql`
    select c.id, c.name, sum(l.amount_cents - coalesce((select sum(a.amount_cents) from ledger_allocations a where a.charge_id = l.id), 0))::text as overdue
    from customer_ledger l join customers c on c.id = l.customer_id
    where l.amount_cents > 0 and l.due_on < ${today} and c.deleted_at is null
    group by c.id, c.name
    having sum(l.amount_cents - coalesce((select sum(a.amount_cents) from ledger_allocations a where a.charge_id = l.id), 0)) > 0`);
  for (const r of overdue) {
    await raiseAlert(db, {
      kind: "credit_overdue",
      title: `${r.name} tiene ${formatMoney(Number(r.overdue))} de fiado vencido`,
      refType: "customer",
      refId: r.id,
      dedupeKey: `credit_overdue:${r.id}`,
      reopen: false,
    });
    out.creditOverdue++;
  }

  // Los pospuestos vuelven cuando se cumple el plazo.
  const back = await db
    .update(alerts)
    .set({ status: "open", snoozedUntil: null, pushedAt: null })
    .where(and(eq(alerts.status, "snoozed"), lte(alerts.snoozedUntil, now)))
    .returning({ id: alerts.id });
  out.unsnoozed = back.length;
  return out;
}

export type PushMessage = { title: string; body: string; url: string; tag: string };
export type PushSender = (
  sub: { endpoint: string; p256dh: string; auth: string },
  msg: PushMessage,
) => Promise<"ok" | "gone" | "error">;

/**
 * Manda por push los avisos nuevos a quien corresponde según la matriz (tipo × rol).
 * Si el navegador ya no existe (404/410), se borra la suscripción.
 */
export async function dispatchPush(db: Db, send: PushSender, now = new Date()) {
  const pending = await db
    .select()
    .from(alerts)
    .where(
      and(
        isNull(alerts.pushedAt),
        eq(alerts.status, "open"),
        gt(alerts.createdAt, new Date(now.getTime() - 24 * HOUR)),
      ),
    )
    .limit(50);
  if (!pending.length) return { sent: 0, alerts: 0 };
  const [cfg] = await db.select().from(settings).where(eq(settings.key, "alerts"));
  const matrix = { ...DEFAULT_ALERTS, ...((cfg?.value as object) ?? {}) };
  const team = await db
    .select({ id: members.id, role: members.role })
    .from(members)
    .where(eq(members.active, true));
  const subs = await db.select().from(pushSubscriptions);
  let sent = 0;
  for (const a of pending) {
    const to = new Set(
      team.filter((m) => alertFor(matrix, a.kind, m.role as Role, "push")).map((m) => m.id),
    );
    const msg = { title: a.title, body: a.body ?? "", url: alertPath(a), tag: a.dedupeKey ?? a.id };
    for (const s of subs.filter((x) => to.has(x.memberId))) {
      const r = await send(s, msg).catch(() => "error" as const);
      if (r === "ok") {
        sent++;
        await db
          .update(pushSubscriptions)
          .set({ lastSuccessAt: now })
          .where(eq(pushSubscriptions.id, s.id));
      } else if (r === "gone") {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      }
    }
    await db.update(alerts).set({ pushedAt: now }).where(eq(alerts.id, a.id));
  }
  log.debug("push", { alerts: pending.length, sent });
  return { sent, alerts: pending.length };
}
