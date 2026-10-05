import {
  listCost,
  newId,
  payableState,
  payablesSummary,
  pendingOf,
  todayAR,
} from "@mostrador/shared";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { requireFull } from "../auth/permissions";
import {
  barcodes,
  members,
  products,
  supplierInvoices,
  supplierPayments,
  supplierProducts,
  suppliers,
} from "../db/schema/index";
import { auditFrom } from "../lib/audit";
import { ApiError, conflict, notFound } from "../lib/errors";
import { validate } from "../lib/validate";

export const payableRoutes = new Hono<AppEnv>();

const listQuery = z.object({
  view: z.enum(["pending", "paid", "all"]).default("pending"),
  supplierId: z.uuid().optional(),
});

/** Facturas, remitos y notas de crédito con su estado, la agenda de la semana y el saldo por proveedor. */
payableRoutes.get(
  "/payables",
  requireActor(),
  requireFull("view_costs"),
  validate("query", listQuery),
  async (c) => {
    const { view, supplierId } = c.req.valid("query");
    const db = c.get("db");
    const today = todayAR();
    const all = await db
      .select({ inv: supplierInvoices, supplierName: suppliers.name })
      .from(supplierInvoices)
      .innerJoin(suppliers, eq(suppliers.id, supplierInvoices.supplierId))
      .where(supplierId ? eq(supplierInvoices.supplierId, supplierId) : undefined)
      .orderBy(asc(supplierInvoices.dueOn), desc(supplierInvoices.issuedOn));
    const summary = payablesSummary(
      all.map((r) => r.inv),
      today,
    );
    const items = all
      .map((r) => ({
        ...r.inv,
        supplierName: r.supplierName,
        state: payableState(r.inv, today),
        pendingCents: pendingOf(r.inv),
      }))
      .filter((x) => view === "all" || (view === "paid" ? x.state === "paid" : x.state !== "paid"));
    const names = Object.fromEntries(all.map((r) => [r.inv.supplierId, r.supplierName]));
    return c.json({
      items: view === "paid" ? items.reverse().slice(0, 200) : items,
      summary: {
        ...summary,
        bySupplier: Object.entries(summary.bySupplier).map(([id, cents]) => ({
          supplierId: id,
          name: names[id] ?? "",
          cents,
        })),
      },
    });
  },
);

payableRoutes.get("/payables/:id", requireActor(), requireFull("view_costs"), async (c) => {
  const db = c.get("db");
  const [r] = await db
    .select({ inv: supplierInvoices, supplierName: suppliers.name })
    .from(supplierInvoices)
    .innerJoin(suppliers, eq(suppliers.id, supplierInvoices.supplierId))
    .where(eq(supplierInvoices.id, c.req.param("id")));
  if (!r) throw notFound("Esa factura no existe.");
  const payments = await db
    .select({ p: supplierPayments, by: members.name })
    .from(supplierPayments)
    .leftJoin(members, eq(members.id, supplierPayments.memberId))
    .where(eq(supplierPayments.invoiceId, r.inv.id))
    .orderBy(asc(supplierPayments.paidAt));
  return c.json({
    ...r.inv,
    supplierName: r.supplierName,
    state: payableState(r.inv, todayAR()),
    pendingCents: pendingOf(r.inv),
    payments: payments.map((p) => ({ ...p.p, by: p.by })),
  });
});

const createBody = z.object({
  supplierId: z.uuid(),
  kind: z.enum(["invoice", "delivery_note", "credit_note"]),
  number: z.string().max(40).nullable().optional(),
  issuedOn: z.iso.date(),
  dueOn: z.iso.date().nullable().optional(),
  /** Siempre positivo: la nota de crédito se guarda en negativo. */
  amountCents: z.number().int().positive(),
  photoId: z.uuid().nullable().optional(),
  notes: z.string().max(300).nullable().optional(),
});

payableRoutes.post(
  "/payables",
  requireActor(),
  requireFull("view_costs"),
  validate("json", createBody),
  async (c) => {
    const b = c.req.valid("json");
    const db = c.get("db");
    const [s] = await db.select().from(suppliers).where(eq(suppliers.id, b.supplierId));
    if (!s) throw notFound("Ese proveedor no existe.");
    const id = newId();
    const credit = b.kind === "credit_note";
    await db.insert(supplierInvoices).values({
      id,
      supplierId: b.supplierId,
      kind: b.kind,
      number: b.number ?? null,
      issuedOn: b.issuedOn,
      dueOn: credit ? null : (b.dueOn ?? null),
      amountCents: credit ? -b.amountCents : b.amountCents,
      photoUrl: b.photoId ? `/api/files/${b.photoId}` : null,
      notes: b.notes ?? null,
    });
    await auditFrom(c, db, {
      action: "payable.created",
      entityType: "supplier_invoice",
      entityId: id,
      after: b,
    });
    return c.json({ id }, 201);
  },
);

const payBody = z.object({
  method: z.enum(["transfer", "other"]),
  amountCents: z.number().int().positive(),
  paidOn: z.iso.date().optional(),
  note: z.string().max(300).nullable().optional(),
  photoId: z.uuid().nullable().optional(),
});

/** Pago por transferencia u otro medio. En efectivo se paga desde la Caja (queda el movimiento). */
payableRoutes.post(
  "/payables/:id/pay",
  requireActor(),
  requireFull("view_costs"),
  validate("json", payBody),
  async (c) => {
    const id = c.req.param("id");
    const b = c.req.valid("json");
    const db = c.get("db");
    const { member } = actorOf(c);
    const r = await db.transaction(async (tx) => {
      const [inv] = await tx
        .select()
        .from(supplierInvoices)
        .where(eq(supplierInvoices.id, id))
        .for("update");
      if (!inv) throw notFound("Esa factura no existe.");
      if (inv.kind === "credit_note")
        throw conflict("Una nota de crédito no se paga: se aplica a una factura.");
      const pending = pendingOf(inv);
      if (pending <= 0) throw conflict("Esa factura ya está pagada.");
      if (b.amountCents > pending)
        throw new ApiError(422, "overpay", "El pago es más que lo que falta pagar.");
      const paid = inv.paidCents + b.amountCents;
      await tx
        .update(supplierInvoices)
        .set({
          paidCents: paid,
          status: paid >= inv.amountCents ? "paid" : "partial",
          updatedAt: new Date(),
        })
        .where(eq(supplierInvoices.id, id));
      const payId = newId();
      await tx.insert(supplierPayments).values({
        id: payId,
        supplierId: inv.supplierId,
        invoiceId: id,
        amountCents: b.amountCents,
        method: b.method,
        photoUrl: b.photoId ? `/api/files/${b.photoId}` : null,
        note: b.note ?? null,
        memberId: member.id,
        paidAt: b.paidOn ? new Date(`${b.paidOn}T12:00:00-03:00`) : new Date(),
      });
      return { paymentId: payId, pendingCents: inv.amountCents - paid };
    });
    await auditFrom(c, db, {
      action: "payable.paid",
      entityType: "supplier_invoice",
      entityId: id,
      after: { ...b, ...r },
    });
    return c.json(r);
  },
);

/** Aplica una nota de crédito (devolución) a una factura del mismo proveedor. */
payableRoutes.post(
  "/payables/:id/apply-credit",
  requireActor(),
  requireFull("view_costs"),
  validate("json", z.object({ creditNoteId: z.uuid() })),
  async (c) => {
    const id = c.req.param("id");
    const { creditNoteId } = c.req.valid("json");
    const db = c.get("db");
    const { member } = actorOf(c);
    const r = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(supplierInvoices)
        .where(inArray(supplierInvoices.id, [id, creditNoteId]))
        .for("update");
      const inv = rows.find((x) => x.id === id);
      const cn = rows.find((x) => x.id === creditNoteId);
      if (!inv || !cn) throw notFound("No encontré la factura o la nota de crédito.");
      if (cn.kind !== "credit_note" || inv.kind === "credit_note")
        throw conflict("Elegí una factura y una nota de crédito.");
      if (cn.supplierId !== inv.supplierId)
        throw conflict("La nota de crédito es de otro proveedor.");
      const amount = Math.min(-pendingOf(cn), pendingOf(inv));
      if (amount <= 0) throw conflict("No queda nada para aplicar.");
      const paid = inv.paidCents + amount;
      await tx
        .update(supplierInvoices)
        .set({
          paidCents: paid,
          status: paid >= inv.amountCents ? "paid" : "partial",
          updatedAt: new Date(),
        })
        .where(eq(supplierInvoices.id, id));
      const cnPaid = cn.paidCents - amount;
      await tx
        .update(supplierInvoices)
        .set({
          paidCents: cnPaid,
          status: cnPaid <= cn.amountCents ? "paid" : "partial",
          updatedAt: new Date(),
        })
        .where(eq(supplierInvoices.id, cn.id));
      await tx.insert(supplierPayments).values({
        id: newId(),
        supplierId: inv.supplierId,
        invoiceId: id,
        amountCents: amount,
        method: "other",
        note: `Nota de crédito ${cn.number ?? ""}`.trim(),
        memberId: member.id,
        paidAt: new Date(),
      });
      return { appliedCents: amount, pendingCents: inv.amountCents - paid };
    });
    return c.json(r);
  },
);

// ── Lista de precios del proveedor ────────────────────────────────────────────

const terms = z.object({
  vatIncluded: z.boolean(),
  vatBp: z.number().int().min(0).max(5000).default(2100),
  discountBp: z.number().int().min(0).max(9000).default(0),
});
const previewBody = z.object({
  terms,
  rows: z
    .array(
      z.object({
        code: z.string().max(60).nullable().optional(),
        description: z.string().max(200),
        costCents: z.number().int().min(0),
      }),
    )
    .max(10_000),
  /** Relaciones hechas a mano: índice de fila → producto. */
  links: z.record(z.string(), z.uuid()).default({}),
});

/** Qué costos cambian y cuánto: relaciona los códigos del proveedor (o de barras) con los productos. */
payableRoutes.post(
  "/suppliers/:id/price-list/preview",
  requireActor(),
  requireFull("view_costs"),
  validate("json", previewBody),
  async (c) => {
    const supplierId = c.req.param("id");
    const b = c.req.valid("json");
    const db = c.get("db");
    const links = await db
      .select({ sp: supplierProducts, p: products })
      .from(supplierProducts)
      .innerJoin(products, eq(products.id, supplierProducts.productId))
      .where(eq(supplierProducts.supplierId, supplierId));
    const codes = b.rows.map((r) => r.code?.trim()).filter((x): x is string => !!x);
    const byBarcode = codes.length
      ? await db
          .select({ code: barcodes.code, p: products })
          .from(barcodes)
          .innerJoin(products, eq(products.id, barcodes.productId))
          .where(inArray(barcodes.code, codes))
      : [];
    const manual = Object.values(b.links);
    const manualProducts = manual.length
      ? await db.select().from(products).where(inArray(products.id, manual))
      : [];
    const matched = [];
    const unmatched = [];
    for (const [i, r] of b.rows.entries()) {
      const code = r.code?.trim() ?? "";
      const p =
        manualProducts.find((x) => x.id === b.links[String(i)]) ??
        links.find((l) => code && l.sp.supplierCode === code)?.p ??
        byBarcode.find((x) => x.code === code)?.p;
      if (!p) {
        unmatched.push({ index: i, ...r });
        continue;
      }
      const old = links.find((l) => l.p.id === p.id)?.sp.costCents ?? p.costCents ?? null;
      const cost = listCost(r.costCents, b.terms);
      matched.push({
        index: i,
        code: code || null,
        description: r.description,
        productId: p.id,
        name: p.name,
        priceCents: p.priceCents,
        oldCostCents: old,
        newCostCents: cost,
        changeBp: old ? Math.round(((cost - old) / old) * 10000) : null,
      });
    }
    return c.json({
      matched,
      unmatched,
      changed: matched.filter((m) => m.oldCostCents !== m.newCostCents).length,
    });
  },
);

const applyBody = z.object({
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        supplierCode: z.string().max(60).nullable().optional(),
        costCents: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(10_000),
});

/** Guarda los costos nuevos: el producto queda con "Revisar precio" si cambió y se puede saltar al cambio masivo. */
payableRoutes.post(
  "/suppliers/:id/price-list/apply",
  requireActor(),
  requireFull("view_costs"),
  validate("json", applyBody),
  async (c) => {
    const supplierId = c.req.param("id");
    const { items } = c.req.valid("json");
    const db = c.get("db");
    const changed = await db.transaction(async (tx) => {
      const ps = await tx
        .select()
        .from(products)
        .where(
          inArray(
            products.id,
            items.map((i) => i.productId),
          ),
        );
      const others = await tx
        .select()
        .from(supplierProducts)
        .where(
          and(
            inArray(
              supplierProducts.productId,
              items.map((i) => i.productId),
            ),
            ne(supplierProducts.supplierId, supplierId),
          ),
        );
      const changed: string[] = [];
      for (const it of items) {
        const p = ps.find((x) => x.id === it.productId);
        if (!p) continue;
        const [prev] = await tx
          .select()
          .from(supplierProducts)
          .where(
            and(
              eq(supplierProducts.supplierId, supplierId),
              eq(supplierProducts.productId, it.productId),
            ),
          );
        await tx
          .insert(supplierProducts)
          .values({
            id: newId(),
            supplierId,
            productId: it.productId,
            supplierCode: it.supplierCode ?? null,
            costCents: it.costCents,
          })
          .onConflictDoUpdate({
            target: [supplierProducts.supplierId, supplierProducts.productId],
            set: {
              costCents: it.costCents,
              ...(it.supplierCode ? { supplierCode: it.supplierCode } : {}),
              updatedAt: new Date(),
            },
          });
        // El costo del producto sigue al proveedor principal (o al único).
        const main =
          prev?.isPrimary || !others.some((o) => o.productId === it.productId && o.isPrimary);
        if (main && p.costCents !== it.costCents) {
          await tx
            .update(products)
            .set({ costCents: it.costCents, priceReview: true, updatedAt: new Date() })
            .where(eq(products.id, p.id));
          changed.push(p.id);
        }
      }
      return changed;
    });
    await auditFrom(c, db, {
      action: "price_list.applied",
      entityType: "supplier",
      entityId: supplierId,
      after: { items: items.length, changed: changed.length },
    });
    return c.json({ updated: items.length, changed });
  },
);
