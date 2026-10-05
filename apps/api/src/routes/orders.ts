import {
  addDays,
  canMoveOrder,
  effectiveGrant,
  formatMoney,
  MANUAL_STEPS,
  newId,
  ORDER_STATUS,
  type OrderStatus,
  orderMessage,
  orderNumber,
  orderQty,
  todayAR,
  waLink,
  weekday,
} from "@mostrador/shared";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { rgb } from "pdf-lib";
import { z } from "zod";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { loadOverrides, requireFull, requirePermission } from "../auth/permissions";
import type { Db } from "../db/client";
import {
  members,
  products,
  purchaseOrderLines,
  purchaseOrders,
  standingOrderLines,
  standingOrders,
  supplierProducts,
  suppliers,
} from "../db/schema/index";
import type { DbOrTx } from "../domain/types";
import { auditFrom } from "../lib/audit";
import { getBusiness } from "../lib/business";
import { ApiError, conflict, notFound } from "../lib/errors";
import { A4, fit, mm, newPdf } from "../lib/pdf";
import { validate } from "../lib/validate";

export const orderRoutes = new Hono<AppEnv>();

type Ctx = Parameters<typeof actorOf>[0];

async function seesCosts(c: Ctx) {
  const { member } = actorOf(c);
  return (
    effectiveGrant(member.role, "view_costs", await loadOverrides(c.get("db"), member.id)) ===
    "allow"
  );
}

/** Pedido con sus líneas, proveedor y datos del bulto. */
async function loadOrder(db: Db | DbOrTx, id: string) {
  const [row] = await db
    .select({ o: purchaseOrders, s: suppliers })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(eq(purchaseOrders.id, id));
  if (!row) throw notFound("Ese pedido no existe.");
  const lines = await db
    .select({
      l: purchaseOrderLines,
      saleUnit: products.saleUnit,
      packName: products.purchaseUnitName,
      supplierCode: supplierProducts.supplierCode,
    })
    .from(purchaseOrderLines)
    .innerJoin(products, eq(products.id, purchaseOrderLines.productId))
    .leftJoin(
      supplierProducts,
      sql`${supplierProducts.productId} = ${purchaseOrderLines.productId} and ${supplierProducts.supplierId} = ${row.o.supplierId}`,
    )
    .where(eq(purchaseOrderLines.orderId, id))
    .orderBy(asc(purchaseOrderLines.description));
  return {
    order: row.o,
    supplier: row.s,
    lines: lines.map((x) => ({
      ...x.l,
      unit: (x.saleUnit === "unit" ? "unit" : "kg") as "unit" | "kg",
      packName: x.packName,
      supplierCode: x.supplierCode,
    })),
  };
}

type Loaded = Awaited<ReturnType<typeof loadOrder>>;

function view(o: Loaded, costs: boolean) {
  return {
    ...o.order,
    totalCents: costs ? o.order.totalCents : undefined,
    supplier: {
      id: o.supplier.id,
      name: o.supplier.name,
      contactName: o.supplier.contactName,
      whatsapp: o.supplier.whatsapp,
      channel: o.supplier.channel,
    },
    lines: o.lines.map((l) => ({ ...l, unitCostCents: costs ? l.unitCostCents : undefined })),
    nextSteps: MANUAL_STEPS[o.order.status],
  };
}

async function messageOf(db: Db | DbOrTx, o: Loaded, costs: boolean) {
  const business = await getBusiness(db);
  const text = orderMessage({
    businessName: business?.name ?? "el almacén",
    contactName: o.supplier.contactName,
    number: o.order.number,
    expectedOn: o.order.expectedOn,
    lines: o.lines.map((l) => ({
      description: l.description,
      qty: l.qtyOrdered,
      unit: l.unit,
      packQty: l.packQty,
      packName: l.packName,
      supplierCode: l.supplierCode,
    })),
    totalCents: costs ? o.order.totalCents : null,
    notes: o.order.notes,
  });
  return { text, url: waLink(o.supplier.whatsapp, text), phone: o.supplier.whatsapp };
}

const listQuery = z.object({ status: z.string().optional(), supplierId: z.uuid().optional() });

orderRoutes.get(
  "/orders",
  requireActor(),
  requirePermission("build_orders"),
  validate("query", listQuery),
  async (c) => {
    const { status, supplierId } = c.req.valid("query");
    const costs = await seesCosts(c);
    const db = c.get("db");
    const statuses = status?.split(",").filter((s): s is OrderStatus => s in ORDER_STATUS);
    const rows = await db
      .select({
        o: purchaseOrders,
        supplierName: suppliers.name,
        lines: sql<number>`(select count(*)::int from purchase_order_lines l where l.order_id = ${purchaseOrders.id})`,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(
        sql`true ${statuses?.length ? sql`and ${inArray(purchaseOrders.status, statuses)}` : sql``} ${supplierId ? sql`and ${eq(purchaseOrders.supplierId, supplierId)}` : sql``}`,
      )
      .orderBy(desc(purchaseOrders.number))
      .limit(200);
    const counts = await db
      .select({ status: purchaseOrders.status, n: sql<number>`count(*)::int` })
      .from(purchaseOrders)
      .groupBy(purchaseOrders.status);
    return c.json({
      items: rows.map((r) => ({
        ...r.o,
        timeline: undefined,
        totalCents: costs ? r.o.totalCents : undefined,
        supplierName: r.supplierName,
        lineCount: r.lines,
      })),
      counts: Object.fromEntries(counts.map((x) => [x.status, x.n])),
    });
  },
);

orderRoutes.get("/orders/:id", requireActor(), requirePermission("build_orders"), async (c) => {
  const o = await loadOrder(c.get("db"), c.req.param("id"));
  const costs = await seesCosts(c);
  const ids = [...new Set(o.order.timeline.map((t) => t.memberId).filter((x): x is string => !!x))];
  const names = ids.length
    ? await c
        .get("db")
        .select({ id: members.id, name: members.name })
        .from(members)
        .where(inArray(members.id, ids))
    : [];
  return c.json({
    ...view(o, costs),
    timeline: o.order.timeline.map((t) => ({
      ...t,
      by: names.find((n) => n.id === t.memberId)?.name ?? null,
    })),
    message: await messageOf(c.get("db"), o, costs),
  });
});

const lineBody = z.object({
  productId: z.uuid(),
  qty: z.number().positive().max(100_000),
  unitCostCents: z.number().int().min(0).nullable().optional(),
});

async function writeLines(
  tx: DbOrTx,
  orderId: string,
  supplierId: string,
  lines: z.infer<typeof lineBody>[],
) {
  await tx.delete(purchaseOrderLines).where(eq(purchaseOrderLines.orderId, orderId));
  if (!lines.length) return 0;
  const ps = await tx
    .select({ p: products, sp: supplierProducts })
    .from(products)
    .leftJoin(
      supplierProducts,
      sql`${supplierProducts.productId} = ${products.id} and ${supplierProducts.supplierId} = ${supplierId}`,
    )
    .where(
      inArray(
        products.id,
        lines.map((l) => l.productId),
      ),
    );
  let total = 0;
  for (const l of lines) {
    const r = ps.find((x) => x.p.id === l.productId);
    if (!r) throw notFound("Uno de los productos no existe.");
    const cost = l.unitCostCents ?? r.sp?.costCents ?? r.p.costCents ?? null;
    total += Math.round((cost ?? 0) * l.qty);
    await tx.insert(purchaseOrderLines).values({
      id: newId(),
      orderId,
      productId: l.productId,
      description: r.p.name,
      qtyOrdered: l.qty,
      packQty: r.sp?.packQty ?? r.p.purchaseUnitQty ?? null,
      unitCostCents: cost,
    });
  }
  return total;
}

const createBody = z.object({
  supplierId: z.uuid(),
  expectedOn: z.iso.date().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  lines: z.array(lineBody).min(1, "El pedido no tiene productos.").max(500),
});

/** Arma un pedido en borrador (desde el sugerido, el pedido fijo o a mano). */
orderRoutes.post(
  "/orders",
  requireActor(),
  requireFull("build_orders"),
  validate("json", createBody),
  async (c) => c.json(await createOrder(c, c.req.valid("json")), 201),
);

async function createOrder(c: Ctx, b: z.infer<typeof createBody>) {
  const db = c.get("db");
  const { member } = actorOf(c);
  const costs = await seesCosts(c);
  const id = await db.transaction(async (tx) => {
    // Numeración correlativa: un candado por transacción evita números repetidos.
    await tx.execute(sql`select pg_advisory_xact_lock(4207)`);
    const [{ next } = { next: 1 }] = await tx
      .select({ next: sql<number>`coalesce(max(${purchaseOrders.number}), 0)::int + 1` })
      .from(purchaseOrders);
    const id = newId();
    await tx.insert(purchaseOrders).values({
      id,
      number: next,
      supplierId: b.supplierId,
      expectedOn: b.expectedOn ?? null,
      notes: b.notes ?? null,
      createdBy: member.id,
      timeline: [{ at: new Date().toISOString(), status: "draft", memberId: member.id }],
    });
    const total = await writeLines(
      tx,
      id,
      b.supplierId,
      costs ? b.lines : b.lines.map((l) => ({ ...l, unitCostCents: undefined })),
    );
    await tx.update(purchaseOrders).set({ totalCents: total }).where(eq(purchaseOrders.id, id));
    return id;
  });
  const o = await loadOrder(db, id);
  await auditFrom(c, db, {
    action: "order.created",
    entityType: "purchase_order",
    entityId: id,
    after: { number: o.order.number, supplier: o.supplier.name, lines: o.lines.length },
  });
  return view(o, costs);
}

const editBody = z.object({
  expectedOn: z.iso.date().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  lines: z.array(lineBody).min(1).max(500).optional(),
});

/** Ajustar el borrador antes de mandarlo. */
orderRoutes.patch(
  "/orders/:id",
  requireActor(),
  requireFull("build_orders"),
  validate("json", editBody),
  async (c) => {
    const id = c.req.param("id");
    const b = c.req.valid("json");
    const db = c.get("db");
    const costs = await seesCosts(c);
    await db.transaction(async (tx) => {
      const [o] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, id))
        .for("update");
      if (!o) throw notFound("Ese pedido no existe.");
      if (b.lines && o.status !== "draft")
        throw conflict("Solo se cambian los productos de un borrador.");
      const set: Partial<typeof purchaseOrders.$inferInsert> = { updatedAt: new Date() };
      if (b.expectedOn !== undefined) set.expectedOn = b.expectedOn;
      if (b.notes !== undefined) set.notes = b.notes;
      if (b.lines)
        set.totalCents = await writeLines(
          tx,
          id,
          o.supplierId,
          costs ? b.lines : b.lines.map((l) => ({ ...l, unitCostCents: undefined })),
        );
      await tx.update(purchaseOrders).set(set).where(eq(purchaseOrders.id, id));
    });
    return c.json(view(await loadOrder(db, id), costs));
  },
);

const statusBody = z.object({
  status: z.enum(["sent", "confirmed", "changed", "closed", "cancelled"]),
  note: z.string().max(300).optional(),
  /** Con cambios: lo que confirmó el proveedor, por línea. */
  confirmed: z.array(z.object({ lineId: z.uuid(), qty: z.number().min(0) })).optional(),
  via: z.enum(["whatsapp", "pdf", "manual"]).optional(),
});

const STAMP: Partial<Record<OrderStatus, "sentAt" | "confirmedAt" | "closedAt">> = {
  sent: "sentAt",
  confirmed: "confirmedAt",
  changed: "confirmedAt",
  closed: "closedAt",
};

/** Estados marcados a mano: enviado, confirmado (o con cambios), cerrado y cancelado. */
orderRoutes.post(
  "/orders/:id/status",
  requireActor(),
  requireFull("build_orders"),
  validate("json", statusBody),
  async (c) => {
    const id = c.req.param("id");
    const b = c.req.valid("json");
    const db = c.get("db");
    const { member } = actorOf(c);
    const costs = await seesCosts(c);
    const from = await db.transaction(async (tx) => {
      const [o] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, id))
        .for("update");
      if (!o) throw notFound("Ese pedido no existe.");
      if (!canMoveOrder(o.status, b.status)) {
        throw new ApiError(
          409,
          "invalid_transition",
          `Un pedido ${ORDER_STATUS[o.status].label.toLowerCase()} no pasa a ${ORDER_STATUS[b.status].label.toLowerCase()}.`,
        );
      }
      const lines = await tx
        .select()
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.orderId, id));
      let changed = false;
      if (b.status === "confirmed" || b.status === "changed") {
        for (const l of lines) {
          const got = b.confirmed?.find((x) => x.lineId === l.id)?.qty ?? l.qtyOrdered;
          if (got !== l.qtyOrdered) changed = true;
          await tx
            .update(purchaseOrderLines)
            .set({ qtyConfirmed: got })
            .where(eq(purchaseOrderLines.id, l.id));
        }
      }
      const status: OrderStatus = b.status === "confirmed" && changed ? "changed" : b.status;
      const note =
        b.note ??
        (b.via === "whatsapp"
          ? "Enviado por WhatsApp"
          : b.via === "pdf"
            ? "Enviado en PDF"
            : undefined);
      const stamp = STAMP[status];
      await tx
        .update(purchaseOrders)
        .set({
          status,
          ...(stamp ? { [stamp]: new Date() } : {}),
          timeline: [
            ...o.timeline,
            {
              at: new Date().toISOString(),
              status,
              memberId: member.id,
              ...(note ? { note } : {}),
            },
          ],
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrders.id, id));
      return o.status;
    });
    const o = await loadOrder(db, id);
    await auditFrom(c, db, {
      action: "order.status",
      entityType: "purchase_order",
      entityId: id,
      before: { status: from },
      after: { status: o.order.status },
    });
    return c.json(view(o, costs));
  },
);

/** El PDF del pedido para adjuntar en el chat o mandar por mail. */
orderRoutes.get("/orders/:id/pdf", requireActor(), requirePermission("build_orders"), async (c) => {
  const db = c.get("db");
  const o = await loadOrder(db, c.req.param("id"));
  const costs = await seesCosts(c);
  const business = await getBusiness(db);
  const pdf = await orderPdf(o, business, costs);
  return c.body(pdf as unknown as ArrayBuffer, 200, {
    "content-type": "application/pdf",
    "content-disposition": `inline; filename="pedido-${orderNumber(o.order.number)}.pdf"`,
  });
});

export async function orderPdf(
  o: Loaded,
  business: { name: string; address?: string | null; city?: string | null } | null,
  costs: boolean,
) {
  const { doc, font, bold } = await newPdf();
  doc.setTitle(`Pedido ${orderNumber(o.order.number)} · ${o.supplier.name}`);
  let page = doc.addPage([A4.w, A4.h]);
  const left = mm(18);
  const right = A4.w - mm(18);
  let y = A4.h - mm(20);
  const gray = rgb(0.42, 0.39, 0.35);
  page.drawText(fit(business?.name ?? "Mostrador", bold, 16, 300), {
    x: left,
    y,
    size: 16,
    font: bold,
  });
  page.drawText(`Pedido ${orderNumber(o.order.number)}`, {
    x: right - bold.widthOfTextAtSize(`Pedido ${orderNumber(o.order.number)}`, 16),
    y,
    size: 16,
    font: bold,
  });
  y -= 16;
  const addr = [business?.address, business?.city].filter(Boolean).join(", ");
  if (addr) page.drawText(fit(addr, font, 10, 300), { x: left, y, size: 10, font, color: gray });
  const created = new Date(o.order.createdAt);
  const when = `Fecha ${created.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" })}`;
  page.drawText(when, {
    x: right - font.widthOfTextAtSize(when, 10),
    y,
    size: 10,
    font,
    color: gray,
  });
  y -= 26;
  page.drawText(
    fit(
      `Para: ${o.supplier.name}${o.supplier.contactName ? ` (${o.supplier.contactName})` : ""}`,
      bold,
      11,
      right - left,
    ),
    { x: left, y, size: 11, font: bold },
  );
  y -= 15;
  if (o.order.expectedOn) {
    const [yy, mmm, dd] = o.order.expectedOn.split("-");
    page.drawText(
      `Entrega: ${["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][weekday(o.order.expectedOn)]} ${dd}/${mmm}/${yy}`,
      { x: left, y, size: 10, font },
    );
    y -= 15;
  }
  y -= 8;
  const cols = costs
    ? { code: left, desc: left + 70, qty: right - 200, cost: right - 90, sub: right }
    : { code: left, desc: left + 70, qty: right, cost: 0, sub: 0 };
  const header = () => {
    page.drawText("Código", { x: cols.code, y, size: 9, font: bold, color: gray });
    page.drawText("Producto", { x: cols.desc, y, size: 9, font: bold, color: gray });
    const q = "Cantidad";
    page.drawText(q, {
      x: cols.qty - bold.widthOfTextAtSize(q, 9),
      y,
      size: 9,
      font: bold,
      color: gray,
    });
    if (costs) {
      page.drawText("Costo", {
        x: cols.cost - bold.widthOfTextAtSize("Costo", 9),
        y,
        size: 9,
        font: bold,
        color: gray,
      });
      page.drawText("Subtotal", {
        x: cols.sub - bold.widthOfTextAtSize("Subtotal", 9),
        y,
        size: 9,
        font: bold,
        color: gray,
      });
    }
    y -= 6;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: gray });
    y -= 14;
  };
  header();
  for (const l of o.lines) {
    if (y < mm(30)) {
      page = doc.addPage([A4.w, A4.h]);
      y = A4.h - mm(20);
      header();
    }
    page.drawText(fit(l.supplierCode ?? "", font, 9, 64), { x: cols.code, y, size: 9, font });
    page.drawText(
      fit(l.description, font, 10, (costs ? cols.qty - 90 : cols.qty - 110) - cols.desc),
      { x: cols.desc, y, size: 10, font },
    );
    const q = fit(
      orderQty({
        description: l.description,
        qty: l.qtyOrdered,
        unit: l.unit,
        packQty: l.packQty,
        packName: l.packName,
      }),
      font,
      10,
      110,
    );
    page.drawText(q, { x: cols.qty - font.widthOfTextAtSize(q, 10), y, size: 10, font });
    if (costs && l.unitCostCents != null) {
      const cst = fit(formatMoney(l.unitCostCents), font, 10, 80);
      const sub = fit(formatMoney(Math.round(l.unitCostCents * l.qtyOrdered)), font, 10, 80);
      page.drawText(cst, { x: cols.cost - font.widthOfTextAtSize(cst, 10), y, size: 10, font });
      page.drawText(sub, { x: cols.sub - font.widthOfTextAtSize(sub, 10), y, size: 10, font });
    }
    y -= 16;
  }
  y -= 4;
  page.drawLine({
    start: { x: left, y: y + 10 },
    end: { x: right, y: y + 10 },
    thickness: 0.6,
    color: gray,
  });
  const count = `${o.lines.length} productos`;
  page.drawText(count, { x: left, y: y - 4, size: 10, font });
  if (costs) {
    const t = fit(`Total estimado ${formatMoney(o.order.totalCents)}`, bold, 12, 260);
    page.drawText(t, { x: right - bold.widthOfTextAtSize(t, 12), y: y - 4, size: 12, font: bold });
  }
  if (o.order.notes)
    page.drawText(fit(`Nota: ${o.order.notes}`, font, 10, right - left), {
      x: left,
      y: y - 24,
      size: 10,
      font,
    });
  return doc.save();
}

/** Pedido fijo (reparto diario): la lista que se repite. */
orderRoutes.get(
  "/standing-orders",
  requireActor(),
  requirePermission("build_orders"),
  async (c) => {
    const db = c.get("db");
    const rows = await db
      .select({ so: standingOrders, supplierName: suppliers.name })
      .from(standingOrders)
      .innerJoin(suppliers, eq(suppliers.id, standingOrders.supplierId))
      .orderBy(asc(suppliers.name));
    const lines = rows.length
      ? await db
          .select({ l: standingOrderLines, name: products.name, saleUnit: products.saleUnit })
          .from(standingOrderLines)
          .innerJoin(products, eq(products.id, standingOrderLines.productId))
          .where(
            inArray(
              standingOrderLines.standingOrderId,
              rows.map((r) => r.so.id),
            ),
          )
          .orderBy(asc(products.name))
      : [];
    return c.json(
      rows.map((r) => ({
        ...r.so,
        supplierName: r.supplierName,
        lines: lines
          .filter((l) => l.l.standingOrderId === r.so.id)
          .map((l) => ({
            productId: l.l.productId,
            qty: l.l.qty,
            name: l.name,
            unit: l.saleUnit === "unit" ? "unit" : "kg",
          })),
      })),
    );
  },
);

const standingBody = z.object({
  supplierId: z.uuid(),
  name: z.string().min(1).max(80),
  weekdays: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  active: z.boolean().default(true),
  lines: z.array(z.object({ productId: z.uuid(), qty: z.number().positive() })).min(1),
});

orderRoutes.put(
  "/standing-orders/:id",
  requireActor(),
  requireFull("build_orders"),
  validate("json", standingBody),
  async (c) => {
    const id = c.req.param("id");
    const b = c.req.valid("json");
    await c.get("db").transaction(async (tx) => {
      await tx
        .insert(standingOrders)
        .values({
          id,
          supplierId: b.supplierId,
          name: b.name,
          weekdays: b.weekdays,
          active: b.active,
        })
        .onConflictDoUpdate({
          target: standingOrders.id,
          set: { name: b.name, weekdays: b.weekdays, active: b.active, updatedAt: new Date() },
        });
      await tx.delete(standingOrderLines).where(eq(standingOrderLines.standingOrderId, id));
      await tx.insert(standingOrderLines).values(
        b.lines.map((l) => ({
          id: newId(),
          standingOrderId: id,
          productId: l.productId,
          qty: l.qty,
        })),
      );
    });
    return c.json({ ok: true });
  },
);

/** Arma el borrador del día desde el pedido fijo: se ajusta con un toque y se manda. */
orderRoutes.post(
  "/standing-orders/:id/draft",
  requireActor(),
  requireFull("build_orders"),
  async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const [so] = await db.select().from(standingOrders).where(eq(standingOrders.id, id));
    if (!so) throw notFound("Ese pedido fijo no existe.");
    const lines = await db
      .select()
      .from(standingOrderLines)
      .where(eq(standingOrderLines.standingOrderId, id));
    // Llega el próximo día de reparto.
    const today = todayAR();
    let expectedOn = addDays(today, 1);
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, i);
      if (!so.weekdays.length || so.weekdays.includes(weekday(d))) {
        expectedOn = d;
        break;
      }
    }
    if (!lines.length) throw conflict("El pedido fijo no tiene productos.");
    const order = await createOrder(c, {
      supplierId: so.supplierId,
      expectedOn,
      notes: `Pedido fijo: ${so.name}`,
      lines: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
    });
    return c.json(order, 201);
  },
);
