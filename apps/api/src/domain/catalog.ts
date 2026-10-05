import {
  mergeFields,
  newId,
  type OpPayload,
  type ProductFields,
  roundQty,
} from "@mostrador/shared";
import { eq, inArray } from "drizzle-orm";
import { barcodes, customers, products, shortages } from "../db/schema/index";
import { audit, diff } from "../lib/audit";
import { raiseAlert } from "./alerts";
import { applyStock } from "./stock";
import { type DbOrTx, need, type OpContext, Rejection } from "./types";

const PRICE_FIELDS: (keyof ProductFields)[] = ["priceCents", "costCents", "marginBp", "fixedPrice"];

/**
 * Alta o edición de producto. Gana el último cambio, campo por campo; si pisó un cambio
 * que el dispositivo no había visto, queda en Actividad. Un código de barras que ya es de
 * otro producto no se mueve: va a Avisos para unir los productos.
 */
export async function upsertProduct(tx: DbOrTx, ctx: OpContext, p: OpPayload<"product.upsert">) {
  const [current] = await tx.select().from(products).where(eq(products.id, p.id)).for("update");
  let created = false;

  if (!current) {
    // Alta rápida: la puede hacer quien vende; queda para completar si no tiene costo.
    if (ctx.grant("change_prices") !== "allow") need(ctx, "sell", "Dar de alta un producto");
    if (!p.changes.name) throw new Rejection("El producto nuevo necesita un nombre");
    const fields = { ...p.changes };
    await tx.insert(products).values({
      ...fields,
      id: p.id,
      name: p.changes.name,
      priceCents: p.changes.priceCents ?? 0,
      needsReview:
        p.changes.needsReview ??
        (p.changes.costCents == null || ctx.grant("change_prices") !== "allow"),
      priceUpdatedAt: ctx.at,
      createdAt: ctx.at,
      updatedAt: new Date(),
    });
    created = true;
    await audit(tx, {
      action: "product.created",
      entityType: "product",
      entityId: p.id,
      after: fields,
      memberId: ctx.memberId,
      deviceId: ctx.deviceId,
      at: ctx.at,
    });
    if (p.initialStock) {
      await applyStock(tx, {
        productId: p.id,
        qty: p.initialStock,
        kind: "adjustment",
        reason: "Stock inicial",
        memberId: ctx.memberId,
        deviceId: ctx.deviceId,
        deviceAt: ctx.at,
      });
    }
  } else {
    need(ctx, "change_prices", "Editar productos");
    const { apply, overwritten } = mergeFields(
      current as unknown as Record<string, unknown>,
      p.changes as Record<string, unknown>,
      p.base as Record<string, unknown> | undefined,
    );
    if (Object.keys(apply).length) {
      const priceChanged = PRICE_FIELDS.some((k) => k in apply);
      await tx
        .update(products)
        .set({
          ...(apply as ProductFields),
          ...(priceChanged ? { priceUpdatedAt: new Date(), priceReview: false } : {}),
          updatedAt: new Date(),
        })
        .where(eq(products.id, p.id));
      const d = diff(current as unknown as Record<string, unknown>, {
        ...(current as unknown as Record<string, unknown>),
        ...apply,
      });
      await audit(tx, {
        action: priceChanged ? "product.price_changed" : "product.updated",
        entityType: "product",
        entityId: p.id,
        before: d.before,
        after: d.after,
        memberId: ctx.memberId,
        authorizedBy: ctx.authorizedBy,
        deviceId: ctx.deviceId,
        note: overwritten.length
          ? `Edición concurrente: pisó ${overwritten.join(", ")} cambiado en otro dispositivo`
          : null,
        at: ctx.at,
      });
    }
  }

  const duplicates: string[] = [];
  if (p.barcodes?.length) {
    const existing = await tx.select().from(barcodes).where(inArray(barcodes.code, p.barcodes));
    const owner = new Map(existing.map((b) => [b.code, b.productId]));
    for (const code of p.barcodes) {
      const other = owner.get(code);
      if (other === p.id) continue;
      if (other) {
        duplicates.push(code);
        const [o] = await tx
          .select({ name: products.name })
          .from(products)
          .where(eq(products.id, other));
        await raiseAlert(tx, {
          kind: "duplicate_barcode",
          title: `El código ${code} está en dos productos`,
          body: `Ya era de "${o?.name ?? "otro producto"}" y se dio de alta "${p.changes.name ?? current?.name ?? ""}". Uní los productos.`,
          refType: "product",
          refId: other,
          dedupeKey: `duplicate_barcode:${code}`,
          data: { code, productIds: [other, p.id] },
        });
        continue;
      }
      await tx.insert(barcodes).values({ id: newId(), productId: p.id, code });
    }
  }
  return { productId: p.id, created, duplicateBarcodes: duplicates };
}

const WASTE_REASONS = new Set(["waste", "breakage", "expired"]);

/** Ajuste con motivo. Lo que carga el repositor queda pendiente de aprobación. */
export async function adjustStock(tx: DbOrTx, ctx: OpContext, p: OpPayload<"stock.adjust">) {
  const g = need(ctx, "adjust_stock", "Ajustar stock");
  const [prod] = await tx.select().from(products).where(eq(products.id, p.productId));
  if (!prod) throw new Rejection("El producto no existe");
  let qty = p.qty;
  if (p.realQty !== undefined) {
    let current = prod.stockQty;
    let factor = 1;
    if (prod.stockBaseId) {
      const [base] = await tx.select().from(products).where(eq(products.id, prod.stockBaseId));
      factor = prod.stockBaseFactor ?? 1;
      current = (base?.stockQty ?? 0) / factor;
    }
    qty = roundQty(p.realQty - current);
  }
  if (!qty) return { movementId: null, pending: false, qty: 0 };
  const r = await applyStock(tx, {
    id: p.id,
    productId: p.productId,
    qty,
    kind: WASTE_REASONS.has(p.reason) ? "waste" : "adjustment",
    reason: p.reason,
    note: p.note ?? null,
    memberId: ctx.memberId,
    deviceId: ctx.deviceId,
    deviceAt: ctx.at,
    status: g === "approval" ? "pending" : "applied",
  });
  if (g === "approval") {
    await raiseAlert(tx, {
      kind: "adjustment_pending",
      title: "Hay ajustes de stock para aprobar",
      body: `${prod.name}: ${qty > 0 ? "+" : ""}${qty}`,
      refType: "stock_movement",
      refId: p.id,
      dedupeKey: "adjustment_pending",
    });
  }
  return { movementId: r?.movementId ?? null, pending: g === "approval", qty };
}

/** Alta (dos campos alcanzan) o edición de un cliente. El límite lo cambia un encargado o el dueño. */
export async function upsertCustomer(tx: DbOrTx, ctx: OpContext, p: OpPayload<"customer.upsert">) {
  need(ctx, "sell", "Cargar clientes");
  const [current] = await tx.select().from(customers).where(eq(customers.id, p.id)).for("update");
  if ("creditLimitCents" in p.changes && ctx.grant("credit_over_limit") !== "allow") {
    if (!(current && current.creditLimitCents === p.changes.creditLimitCents)) {
      throw new Rejection("Cambiar el límite de fiado: lo hace un encargado o el dueño");
    }
  }
  const termsDays = p.changes.terms
    ? { weekly: 7, biweekly: 15, "30d": 30, month_end: 30 }[p.changes.terms]
    : undefined;
  if (!current) {
    if (!p.changes.name) throw new Rejection("El cliente nuevo necesita un nombre");
    await tx.insert(customers).values({
      ...p.changes,
      id: p.id,
      name: p.changes.name,
      ...(termsDays ? { termsDays } : {}),
      createdAt: ctx.at,
    });
    return { customerId: p.id, created: true };
  }
  const { apply } = mergeFields(
    current as unknown as Record<string, unknown>,
    p.changes as Record<string, unknown>,
  );
  if (Object.keys(apply).length) {
    await tx
      .update(customers)
      .set({ ...apply, ...(termsDays ? { termsDays } : {}), updatedAt: new Date() })
      .where(eq(customers.id, p.id));
    if ("creditLimitCents" in apply) {
      await audit(tx, {
        action: "customer.limit_changed",
        entityType: "customer",
        entityId: p.id,
        before: { creditLimitCents: current.creditLimitCents },
        after: { creditLimitCents: apply.creditLimitCents },
        memberId: ctx.memberId,
        deviceId: ctx.deviceId,
        at: ctx.at,
      });
    }
  }
  return { customerId: p.id, created: false };
}

/** Anotar un faltante: entra al próximo pedido sugerido. */
export async function noteShortage(tx: DbOrTx, ctx: OpContext, p: OpPayload<"shortage.note">) {
  need(ctx, "note_shortages", "Anotar faltantes");
  const [prod] = await tx
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, p.productId));
  if (!prod) throw new Rejection("El producto no existe");
  await tx.insert(shortages).values({
    id: p.id,
    productId: p.productId,
    note: p.note ?? null,
    memberId: ctx.memberId,
    createdAt: ctx.at,
  });
  return { shortageId: p.id };
}
