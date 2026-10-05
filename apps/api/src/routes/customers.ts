import {
  creditSummary,
  formatDate,
  formatMoney,
  newId,
  toDateStr,
  todayAR,
} from "@mostrador/shared";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { rgb } from "pdf-lib";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireActor } from "../auth/actor";
import { requireFull, requirePermission } from "../auth/permissions";
import { customerLedger, customers, ledgerAllocations, members, sales } from "../db/schema/index";
import { creditDown, getCustomer } from "../domain/credit";
import { runDomain } from "../domain/request";
import { Rejection } from "../domain/types";
import { auditFrom } from "../lib/audit";
import { getBusiness } from "../lib/business";
import { notFound } from "../lib/errors";
import { A4, fit, mm, newPdf } from "../lib/pdf";
import { validate } from "../lib/validate";

export const customerRoutes = new Hono<AppEnv>();

type Db = AppEnv["Variables"]["db"];

const KIND_LABEL: Record<string, string> = {
  sale: "Compra fiada",
  payment: "Pago",
  refund: "Devolución",
  adjustment: "Ajuste",
  reversal: "Anulación",
};

/** Movimientos con saldo corrido, lo que queda abierto de cada compra y si fue anulado. */
async function movementsOf(db: Db, customerId: string) {
  const rows = await db
    .select({ l: customerLedger, saleNumber: sales.number, by: members.name })
    .from(customerLedger)
    .leftJoin(sales, eq(sales.id, customerLedger.saleId))
    .leftJoin(members, eq(members.id, customerLedger.memberId))
    .where(eq(customerLedger.customerId, customerId))
    .orderBy(asc(customerLedger.createdAt), asc(customerLedger.id));
  const ids = rows.map((r) => r.l.id);
  const alloc = ids.length
    ? await db
        .select({
          chargeId: ledgerAllocations.chargeId,
          cents: sql<string>`sum(${ledgerAllocations.amountCents})`,
        })
        .from(ledgerAllocations)
        .where(inArray(ledgerAllocations.chargeId, ids))
        .groupBy(ledgerAllocations.chargeId)
    : [];
  const allocated = new Map(alloc.map((a) => [a.chargeId, Number(a.cents)]));
  const reversed = new Set(rows.map((r) => r.l.reversesId).filter(Boolean));
  let running = 0;
  return rows.map(({ l, saleNumber, by }) => {
    running += l.amountCents;
    return {
      id: l.id,
      kind: l.kind,
      label:
        l.kind === "sale" && saleNumber
          ? `${KIND_LABEL.sale} · ticket ${String(saleNumber).padStart(6, "0")}`
          : (KIND_LABEL[l.kind] ?? l.kind),
      amountCents: l.amountCents,
      balanceCents: running,
      at: l.createdAt,
      dueOn: l.dueOn,
      method: l.method,
      note: l.note,
      saleId: l.saleId,
      by,
      openCents: l.amountCents > 0 ? l.amountCents - (allocated.get(l.id) ?? 0) : null,
      reversed: reversed.has(l.id),
      reversesId: l.reversesId,
    };
  });
}

const listQuery = z.object({
  filter: z.enum(["all", "debt", "overdue", "over_limit"]).default("all"),
  q: z.string().max(60).optional(),
});

/** Clientes con saldo, límite, días de la deuda más vieja y último movimiento; arriba, la plata en la calle. */
customerRoutes.get(
  "/customers",
  requireActor(),
  requirePermission("sell"),
  validate("query", listQuery),
  async (c) => {
    const { filter, q } = c.req.valid("query");
    const db = c.get("db");
    const today = todayAR();
    const rows = await db
      .select()
      .from(customers)
      .where(
        and(
          isNull(customers.deletedAt),
          q
            ? sql`(${customers.name} ilike ${`%${q}%`} or ${customers.nickname} ilike ${`%${q}%`} or ${customers.phone} ilike ${`%${q}%`})`
            : undefined,
        ),
      )
      .orderBy(asc(customers.name));
    const ledger = rows.length
      ? await db
          .select()
          .from(customerLedger)
          .where(
            inArray(
              customerLedger.customerId,
              rows.map((r) => r.id),
            ),
          )
          .orderBy(asc(customerLedger.createdAt), asc(customerLedger.id))
      : [];
    const items = rows.map((cu) => {
      const mine = ledger.filter((l) => l.customerId === cu.id);
      const s = creditSummary(
        mine.map((l) => ({
          id: l.id,
          amountCents: l.amountCents,
          date: toDateStr(l.createdAt),
          dueOn: l.dueOn,
        })),
        today,
      );
      return {
        ...cu,
        overdueCents: s.overdueCents,
        oldestDebtDays: s.oldestDebtDays,
        overLimit: cu.balanceCents > cu.creditLimitCents,
        lastMovementAt: mine.at(-1)?.createdAt ?? null,
      };
    });
    const pick = items.filter((x) =>
      filter === "debt"
        ? x.balanceCents > 0
        : filter === "overdue"
          ? x.overdueCents > 0
          : filter === "over_limit"
            ? x.overLimit
            : true,
    );
    const inTheStreet = items.reduce((t, x) => t + Math.max(0, x.balanceCents), 0);
    const month = today.slice(0, 7);
    const collectedThisMonth = -ledger
      .filter((l) => l.kind === "payment" && toDateStr(l.createdAt).startsWith(month))
      .reduce((t, l) => t + l.amountCents, 0);
    const overdue = items.filter((x) => x.overdueCents > 0);
    return c.json({
      items: pick,
      totals: {
        inTheStreetCents: inTheStreet,
        collectedThisMonthCents: collectedThisMonth,
        overdueCents: overdue.reduce((t, x) => t + x.overdueCents, 0),
        overdueCustomers: overdue.length,
      },
    });
  },
);

customerRoutes.get("/customers/:id", requireActor(), requirePermission("sell"), async (c) => {
  const db = c.get("db");
  const [cu] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, c.req.param("id")));
  if (!cu || cu.deletedAt) throw notFound("Ese cliente no existe.");
  const movements = await movementsOf(db, cu.id);
  const today = todayAR();
  const s = creditSummary(
    movements.map((m) => ({
      id: m.id,
      amountCents: m.amountCents,
      date: toDateStr(new Date(m.at)),
      dueOn: m.dueOn,
    })),
    today,
  );
  return c.json({
    ...cu,
    ...s,
    availableCents: Math.max(0, cu.creditLimitCents - cu.balanceCents),
    movements: movements.reverse(),
  });
});

/** Un movimiento nunca se borra: se anula con un contramovimiento visible. */
customerRoutes.post(
  "/customers/:id/ledger/:entryId/reverse",
  requireActor(),
  requireFull("credit_over_limit"),
  validate("json", z.object({ reason: z.string().min(1, "Contá por qué").max(200) })),
  async (c) => {
    const { id, entryId } = c.req.param();
    const { reason } = c.req.valid("json");
    const r = await runDomain(c, async (tx, ctx) => {
      await getCustomer(tx, id, true);
      const [e] = await tx
        .select()
        .from(customerLedger)
        .where(and(eq(customerLedger.id, entryId), eq(customerLedger.customerId, id)));
      if (!e) throw new Rejection("Ese movimiento no es de este cliente");
      if (e.kind === "reversal") throw new Rejection("Una anulación no se anula");
      const [done] = await tx
        .select({ id: customerLedger.id })
        .from(customerLedger)
        .where(eq(customerLedger.reversesId, entryId));
      if (done) throw new Rejection("Ese movimiento ya está anulado");
      if (e.amountCents > 0) {
        // Anular una compra fiada: baja la deuda, primero de esa misma compra.
        return creditDown(tx, ctx, {
          customerId: id,
          amountCents: e.amountCents,
          kind: "reversal",
          reversesId: e.id,
          applyTo: [e.id],
          note: reason,
        });
      }
      // Anular un pago: la deuda vuelve como un cargo nuevo.
      const newEntry = newId();
      await tx.insert(customerLedger).values({
        id: newEntry,
        customerId: id,
        kind: "reversal",
        amountCents: -e.amountCents,
        reversesId: e.id,
        dueOn: todayAR(ctx.at),
        note: reason,
        memberId: ctx.memberId,
        deviceId: ctx.deviceId,
        deviceAt: ctx.at,
        createdAt: ctx.at,
      });
      await tx
        .update(customers)
        .set({
          balanceCents: sql`${customers.balanceCents} + ${-e.amountCents}`,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, id));
      return newEntry;
    });
    await auditFrom(c, c.get("db"), {
      action: "credit.reversed",
      entityType: "customer_ledger",
      entityId: entryId,
      after: { reason, reversal: r },
    });
    return c.json({ id: r });
  },
);

/** Estado de cuenta en PDF para compartir con el cliente. */
customerRoutes.get(
  "/customers/:id/statement.pdf",
  requireActor(),
  requirePermission("sell"),
  async (c) => {
    const db = c.get("db");
    const [cu] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, c.req.param("id")));
    if (!cu) throw notFound("Ese cliente no existe.");
    const movements = await movementsOf(db, cu.id);
    const business = await getBusiness(db);
    const today = todayAR();
    const s = creditSummary(
      movements.map((m) => ({
        id: m.id,
        amountCents: m.amountCents,
        date: toDateStr(new Date(m.at)),
        dueOn: m.dueOn,
      })),
      today,
    );
    const { doc, font, bold } = await newPdf();
    doc.setTitle(`Estado de cuenta · ${cu.name}`);
    let page = doc.addPage([A4.w, A4.h]);
    const left = mm(18);
    const right = A4.w - mm(18);
    const gray = rgb(0.42, 0.39, 0.35);
    let y = A4.h - mm(20);
    page.drawText(fit(business?.name ?? "Mostrador", bold, 16, 320), {
      x: left,
      y,
      size: 16,
      font: bold,
    });
    y -= 16;
    const addr = [business?.address, business?.city].filter(Boolean).join(", ");
    if (addr) page.drawText(fit(addr, font, 10, 320), { x: left, y, size: 10, font, color: gray });
    y -= 28;
    page.drawText(fit(`Estado de cuenta de ${cu.name}`, bold, 13, right - left), {
      x: left,
      y,
      size: 13,
      font: bold,
    });
    y -= 16;
    page.drawText(`Al ${formatDate(today)}`, { x: left, y, size: 10, font, color: gray });
    y -= 24;
    const box = (label: string, value: string, x: number) => {
      page.drawText(label, { x, y, size: 9, font, color: gray });
      page.drawText(value, { x, y: y - 16, size: 14, font: bold });
    };
    box("Saldo", formatMoney(s.balanceCents), left);
    box("Límite", formatMoney(cu.creditLimitCents), left + 150);
    box("Vencido", formatMoney(s.overdueCents), left + 300);
    y -= 44;
    const head = () => {
      for (const [t, x, alignRight] of [
        ["Fecha", left, false],
        ["Concepto", left + 70, false],
        ["Monto", right - 90, true],
        ["Saldo", right, true],
      ] as const) {
        page.drawText(t, {
          x: alignRight ? x - bold.widthOfTextAtSize(t, 9) : x,
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
    head();
    for (const m of movements) {
      if (y < mm(25)) {
        page = doc.addPage([A4.w, A4.h]);
        y = A4.h - mm(20);
        head();
      }
      const amount = `${m.amountCents < 0 ? "-" : ""}${formatMoney(Math.abs(m.amountCents))}`;
      const bal = formatMoney(m.balanceCents);
      page.drawText(formatDate(new Date(m.at)), { x: left, y, size: 10, font });
      page.drawText(
        fit(`${m.label}${m.reversed ? " (anulado)" : ""}`, font, 10, right - 110 - (left + 70)),
        { x: left + 70, y, size: 10, font },
      );
      page.drawText(fit(amount, font, 10, 90), {
        x: right - 90 - font.widthOfTextAtSize(fit(amount, font, 10, 90), 10),
        y,
        size: 10,
        font,
      });
      page.drawText(bal, { x: right - font.widthOfTextAtSize(bal, 10), y, size: 10, font });
      y -= 15;
    }
    if (s.oldestDebtDays != null) {
      y -= 10;
      page.drawText(`Deuda más vieja: ${s.oldestDebtDays} días`, {
        x: left,
        y,
        size: 10,
        font,
        color: gray,
      });
    }
    const pdf = await doc.save();
    return c.body(pdf as unknown as ArrayBuffer, 200, {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="estado-de-cuenta.pdf"`,
    });
  },
);
