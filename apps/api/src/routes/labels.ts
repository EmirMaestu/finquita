import { effectiveGrant, formatMoney, internalBarcode } from "@mostrador/shared";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { rgb } from "pdf-lib";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { loadOverrides } from "../auth/permissions";
import type { Db } from "../db/client";
import { barcodes, categories, products } from "../db/schema/index";
import { audit } from "../lib/audit";
import { getBusiness } from "../lib/business";
import { A4, drawEan13, fit, mm, newPdf } from "../lib/pdf";

export type CodeSheetItem = {
  id: string;
  name: string;
  plu: string;
  code: string;
  priceCents: number;
  saleUnit: string;
  category: string | null;
};

/**
 * Productos sin código de barras con su código interno (EAN-13 que empieza con 2).
 * A los que no tienen PLU se les asigna el próximo libre (si quien pide puede editar productos).
 */
export async function codeSheet(
  db: Db,
  opts: { assign: boolean; memberId: string | null },
): Promise<CodeSheetItem[]> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ p: products, category: categories.name })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          isNull(products.deletedAt),
          eq(products.active, true),
          eq(products.kind, "product"),
          sql`not exists (select 1 from ${barcodes} where ${barcodes.productId} = ${products.id})`,
        ),
      )
      .orderBy(asc(categories.name), asc(products.name))
      .for("update", { of: products });
    if (opts.assign && rows.some((r) => !r.p.internalCode)) {
      const [{ max } = { max: 0 }] = await tx
        .select({
          max: sql<number>`coalesce(max(case when ${products.internalCode} ~ '^[0-9]{1,11}$' then ${products.internalCode}::bigint end), 0)::int`,
        })
        .from(products);
      let next = Math.max(4000, max) + 1;
      for (const r of rows) {
        if (r.p.internalCode) continue;
        const plu = String(next++);
        await tx
          .update(products)
          .set({ internalCode: plu, updatedAt: new Date() })
          .where(eq(products.id, r.p.id));
        await audit(tx, {
          action: "product.plu_assigned",
          entityType: "product",
          entityId: r.p.id,
          after: { internalCode: plu },
          memberId: opts.memberId,
        });
        r.p.internalCode = plu;
      }
    }
    return rows
      .filter((r) => r.p.internalCode && /^\d{1,11}$/.test(r.p.internalCode))
      .map((r) => ({
        id: r.p.id,
        name: r.p.name,
        plu: r.p.internalCode as string,
        code: internalBarcode(r.p.internalCode as string),
        priceCents: r.p.priceCents,
        saleUnit: r.p.saleUnit,
        category: r.category,
      }));
  });
}

/** Planilla A4: 3 columnas × 8 filas, nombre, precio y el código para escanear con la pistola. */
export async function codeSheetPdf(
  items: CodeSheetItem[],
  businessName: string,
): Promise<Uint8Array> {
  const { doc, font, bold } = await newPdf();
  const cols = 3;
  const rowsPerPage = 8;
  const margin = mm(10);
  const top = mm(18);
  const cellW = (A4.w - margin * 2) / cols;
  const cellH = (A4.h - top - margin) / rowsPerPage;
  const pages = Math.max(1, Math.ceil(items.length / (cols * rowsPerPage)));
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([A4.w, A4.h]);
    page.drawText(
      fit(`${businessName} · Planilla de códigos internos`, bold, 11, A4.w - margin * 2 - 60),
      { x: margin, y: A4.h - mm(12), size: 11, font: bold },
    );
    page.drawText(`${p + 1} / ${pages}`, {
      x: A4.w - margin - 30,
      y: A4.h - mm(12),
      size: 9,
      font,
    });
    const slice = items.slice(p * cols * rowsPerPage, (p + 1) * cols * rowsPerPage);
    slice.forEach((it, i) => {
      const cx = margin + (i % cols) * cellW;
      const cy = A4.h - top - Math.floor(i / cols) * cellH - cellH;
      page.drawRectangle({
        x: cx + 2,
        y: cy + 2,
        width: cellW - 4,
        height: cellH - 4,
        borderColor: rgb(0.9, 0.88, 0.85),
        borderWidth: 0.5,
      });
      page.drawText(fit(it.name, bold, 9, cellW - 16), {
        x: cx + 8,
        y: cy + cellH - 18,
        size: 9,
        font: bold,
      });
      const price = `${formatMoney(it.priceCents)}${it.saleUnit === "kg" ? " / kg" : ""} · PLU ${it.plu}`;
      page.drawText(fit(price, font, 8, cellW - 16), {
        x: cx + 8,
        y: cy + cellH - 30,
        size: 8,
        font,
      });
      drawEan13(page, font, it.code, cx + 12, cy + 10, cellW - 24, cellH - 50);
    });
  }
  return doc.save();
}

export const labelRoutes = new Hono<AppEnv>();

async function sheetFor(c: Parameters<typeof actorOf>[0]) {
  const { member } = actorOf(c);
  const db = c.get("db");
  const canEdit =
    effectiveGrant(member.role, "change_prices", await loadOverrides(db, member.id)) === "allow";
  return codeSheet(db, { assign: canEdit, memberId: member.id });
}

labelRoutes.get("/labels/codes", requireActor(), async (c) => c.json(await sheetFor(c)));

labelRoutes.get("/labels/codes.pdf", requireActor(), async (c) => {
  const items = await sheetFor(c);
  const pdf = await codeSheetPdf(items, (await getBusiness(c.get("db")))?.name ?? "Mostrador");
  return c.body(pdf as unknown as ArrayBuffer, 200, {
    "content-type": "application/pdf",
    "content-disposition": 'inline; filename="planilla-de-codigos.pdf"',
  });
});
