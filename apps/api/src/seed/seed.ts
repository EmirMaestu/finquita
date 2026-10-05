import { addDays, arDateTime, type DateStr, DEFAULT_SETTINGS, todayAR } from "@mostrador/shared";
import type { Db } from "../db/client";
import {
  barcodes,
  businesses,
  categories,
  customerLedger,
  customers,
  ledgerAllocations,
  lots,
  members,
  products,
  purchaseOrderLines,
  purchaseOrders,
  registers,
  settings,
  stockMovements,
  supplierInvoices,
  supplierProducts,
  suppliers,
} from "../db/schema/index";
import { seedId } from "./ids";
import { BUSINESS, CATEGORIES, CUSTOMERS, ORDER_0042, PRODUCTS, SUPPLIERS, TEAM } from "./scenario";

const cents = (pesos: number) => Math.round(pesos * 100);
const marginBp = (cost: number, price: number) => Math.round((price / cost - 1) * 10000);

export type SeedOptions = {
  /** Fecha del escenario (sábado 3/10/2026 en el spec). Por defecto, hoy. */
  today?: DateStr;
  /** Hash del PIN (lo agrega la autenticación). */
  hashPin?: (pin: string) => Promise<string>;
};

/** Carga el escenario de § Datos de ejemplo. Corre dos veces sin duplicar. */
export async function seed(db: Db, opts: SeedOptions = {}) {
  const today = opts.today ?? todayAR();
  const at = (daysAgo: number, time = "12:00") => arDateTime(addDays(today, -daysAgo), time);

  await db.transaction(async (tx) => {
    await tx
      .insert(businesses)
      .values({ id: seedId("business"), ...BUSINESS })
      .onConflictDoNothing();

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await tx.insert(settings).values({ key, value }).onConflictDoNothing();
    }

    for (const m of TEAM) {
      await tx
        .insert(members)
        .values({
          id: seedId(`member:${m.key}`),
          name: m.name,
          role: m.role,
          email: m.email ?? null,
          pinHash: opts.hashPin ? await opts.hashPin(m.pin) : null,
        })
        .onConflictDoNothing();
    }

    await tx
      .insert(registers)
      .values({
        id: seedId("register:1"),
        name: "Caja 1",
        number: 1,
        suggestedFloatCents: cents(20000),
        toleranceCents: cents(500),
      })
      .onConflictDoNothing();

    for (const [i, c] of CATEGORIES.entries()) {
      await tx
        .insert(categories)
        .values({
          id: seedId(`category:${c.key}`),
          name: c.name,
          parentId: c.parent ? seedId(`category:${c.parent}`) : null,
          defaultMarginBp: c.margin ? c.margin * 100 : null,
          ageRestricted: c.adult ?? false,
          tracksExpiry: c.expiry ?? false,
          sort: i,
        })
        .onConflictDoNothing();
    }

    for (const s of SUPPLIERS) {
      await tx
        .insert(suppliers)
        .values({
          id: seedId(`supplier:${s.key}`),
          name: s.name,
          category: s.category,
          contactName: s.contact ?? null,
          whatsapp: s.whatsapp ?? null,
          channel: s.channel,
          orderDays: s.orderDays,
          deliveryDays: s.deliveryDays,
          scheduleNote: s.scheduleNote ?? null,
          minOrderCents: s.minOrder ? cents(s.minOrder) : null,
          paymentTermsDays: s.termsDays ?? null,
        })
        .onConflictDoNothing();
    }

    // Primero los productos base de las presentaciones vinculadas.
    const ordered = [...PRODUCTS].sort((a, b) => Number(Boolean(a.base)) - Number(Boolean(b.base)));
    for (const p of ordered) {
      const id = seedId(`product:${p.key}`);
      const inserted = await tx
        .insert(products)
        .values({
          id,
          name: p.name,
          categoryId: seedId(`category:${p.category}`),
          internalCode: p.plu ?? null,
          saleUnit: p.unit ?? "unit",
          purchaseUnitName: p.packName ?? null,
          purchaseUnitQty: p.pack ?? null,
          stockBaseId: p.base ? seedId(`product:${p.base[0]}`) : null,
          stockBaseFactor: p.base ? p.base[1] : null,
          costCents: cents(p.cost),
          avgCostCents: cents(p.cost),
          marginBp: marginBp(p.cost, p.price),
          priceCents: cents(p.price),
          fixedPrice: p.fixedPrice ?? false,
          stockQty: p.base ? 0 : p.stock,
          minStock: p.min,
          ageRestricted: p.adult ?? false,
          tracksExpiry: p.expiresInDays !== undefined,
          quickButton: p.quick ?? false,
          location: p.location ?? null,
          priceUpdatedAt: at(14),
        })
        .onConflictDoNothing()
        .returning({ id: products.id });
      if (!inserted.length) continue;

      if (p.barcode) {
        await tx
          .insert(barcodes)
          .values({ id: seedId(`barcode:${p.barcode}`), productId: id, code: p.barcode });
      }
      // El stock es la suma de sus movimientos: arranca con un ajuste de stock inicial.
      if (!p.base && p.stock !== 0) {
        await tx.insert(stockMovements).values({
          id: seedId(`stock:init:${p.key}`),
          productId: id,
          kind: "adjustment",
          qty: p.stock,
          resultingQty: p.stock,
          reason: "Stock inicial",
          createdAt: at(30),
        });
      }
      if (p.expiresInDays !== undefined) {
        await tx.insert(lots).values({
          id: seedId(`lot:${p.key}`),
          productId: id,
          expiresOn: addDays(today, p.expiresInDays),
          qtyRemaining: p.stock,
        });
      }
      await tx.insert(supplierProducts).values({
        id: seedId(`supplier-product:${p.supplier}:${p.key}`),
        supplierId: seedId(`supplier:${p.supplier}`),
        productId: id,
        supplierCode: p.supplierCode ?? null,
        costCents: cents(p.cost),
        packQty: p.pack ?? null,
        isPrimary: true,
      });
    }

    for (const c of CUSTOMERS) {
      const customerId = seedId(`customer:${c.key}`);
      const balance = c.ledger.reduce((s, e) => s + e.amount, 0);
      const inserted = await tx
        .insert(customers)
        .values({
          id: customerId,
          name: c.name,
          nickname: c.nickname ?? null,
          phone: c.phone ?? null,
          creditLimitCents: cents(c.limit),
          terms: c.terms,
          termsDays: 30,
          balanceCents: cents(balance),
        })
        .onConflictDoNothing()
        .returning({ id: customers.id });
      if (!inserted.length) continue;
      const charges: { id: string; open: number }[] = [];
      for (const [i, e] of c.ledger.entries()) {
        const entryId = seedId(`ledger:${c.key}:${i}`);
        const date = addDays(today, -e.daysAgo);
        await tx.insert(customerLedger).values({
          id: entryId,
          customerId,
          kind: e.amount > 0 ? "sale" : "payment",
          amountCents: cents(e.amount),
          dueOn: e.amount > 0 ? addDays(date, 30) : null,
          method: e.amount > 0 ? null : "cash",
          createdAt: at(e.daysAgo, "11:00"),
        });
        if (e.amount > 0) {
          charges.push({ id: entryId, open: cents(e.amount) });
        } else {
          // El pago cancela lo más viejo primero.
          let pay = cents(-e.amount);
          for (const [j, ch] of charges.entries()) {
            if (pay === 0) break;
            const used = Math.min(pay, ch.open);
            if (used === 0) continue;
            ch.open -= used;
            pay -= used;
            await tx.insert(ledgerAllocations).values({
              id: seedId(`alloc:${c.key}:${i}:${j}`),
              paymentId: entryId,
              chargeId: ch.id,
              amountCents: used,
            });
          }
        }
      }
    }

    // Pedido 0042 a Lácteos del Sur: se manda el martes y llega el jueves.
    const orderId = seedId("order:0042");
    const lines = ORDER_0042.map((l) => {
      const p = PRODUCTS.find((x) => x.key === l.product);
      if (!p) throw new Error(`Falta el producto ${l.product}`);
      return { ...l, p };
    });
    const total = lines.reduce((s, l) => s + cents(l.p.cost) * l.qty, 0);
    const insertedOrder = await tx
      .insert(purchaseOrders)
      .values({
        id: orderId,
        number: 42,
        supplierId: seedId("supplier:lacteos"),
        status: "draft",
        expectedOn: addDays(today, 5),
        totalCents: total,
        timeline: [{ at: at(0, "18:30").toISOString(), status: "draft" }],
      })
      .onConflictDoNothing()
      .returning({ id: purchaseOrders.id });
    if (insertedOrder.length) {
      for (const [i, l] of lines.entries()) {
        await tx.insert(purchaseOrderLines).values({
          id: seedId(`order:0042:line:${i}`),
          orderId,
          productId: seedId(`product:${l.product}`),
          description: l.p.name,
          qtyOrdered: l.qty,
          packQty: l.p.pack ?? null,
          unitCostCents: cents(l.p.cost),
        });
      }
    }

    // Pedido a Distribuidora Andina enviado hace 26 h, sin confirmar.
    const order41 = seedId("order:0041");
    const andina = [
      { key: "yerba", qty: 24 },
      { key: "coca", qty: 16 },
      { key: "aceite", qty: 12 },
      { key: "fideos", qty: 20 },
    ];
    const sentAt = new Date(at(0, "18:40").getTime() - 26 * 3_600_000);
    const inserted41 = await tx
      .insert(purchaseOrders)
      .values({
        id: order41,
        number: 41,
        supplierId: seedId("supplier:andina"),
        status: "sent",
        sentAt,
        expectedOn: addDays(today, 2),
        totalCents: andina.reduce(
          (s, l) => s + cents(PRODUCTS.find((p) => p.key === l.key)?.cost ?? 0) * l.qty,
          0,
        ),
        timeline: [
          { at: new Date(sentAt.getTime() - 600_000).toISOString(), status: "draft" },
          { at: sentAt.toISOString(), status: "sent" },
        ],
      })
      .onConflictDoNothing()
      .returning({ id: purchaseOrders.id });
    if (inserted41.length) {
      for (const [i, l] of andina.entries()) {
        const p = PRODUCTS.find((x) => x.key === l.key);
        if (!p) continue;
        await tx.insert(purchaseOrderLines).values({
          id: seedId(`order:0041:line:${i}`),
          orderId: order41,
          productId: seedId(`product:${l.key}`),
          description: p.name,
          qtyOrdered: l.qty,
          packQty: p.pack ?? null,
          unitCostCents: cents(p.cost),
        });
      }
    }

    // Saldos a pagar: una factura pendiente por proveedor. La de Lácteos vence mañana.
    for (const s of SUPPLIERS) {
      if (s.balance === 0) continue;
      const due = s.key === "lacteos" ? 1 : s.key === "limpieza" ? 12 : 5;
      await tx
        .insert(supplierInvoices)
        .values({
          id: seedId(`invoice:${s.key}`),
          supplierId: seedId(`supplier:${s.key}`),
          kind: "invoice",
          number: `A-0003-${String(1000 + s.balance / 100).padStart(8, "0")}`,
          issuedOn: addDays(today, due - (s.termsDays ?? 15)),
          dueOn: addDays(today, due),
          amountCents: cents(s.balance),
        })
        .onConflictDoNothing();
    }
  });
}
