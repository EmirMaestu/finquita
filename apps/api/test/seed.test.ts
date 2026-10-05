import { creditSummary, toDateStr } from "@mostrador/shared";
import { count, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  barcodes,
  customerLedger,
  customers,
  members,
  products,
  purchaseOrderLines,
  purchaseOrders,
  stockMovements,
  supplierInvoices,
} from "../src/db/schema/index";
import { seed } from "../src/seed/seed";
import { createTestDb, type TestDb } from "./db";

const TODAY = "2026-10-03";
let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db, { today: TODAY });
  await seed(t.db, { today: TODAY });
});
afterAll(async () => {
  await t.close();
});

async function total(table: PgTable) {
  const [row] = await t.db.select({ n: count() }).from(table);
  return row?.n ?? 0;
}

describe("datos de ejemplo", () => {
  it("corre dos veces sin duplicar", async () => {
    expect(await total(members)).toBe(5);
    expect(await total(customers)).toBe(5);
    expect(await total(purchaseOrders)).toBe(2);
    expect(await total(purchaseOrderLines)).toBe(18);
    const nProducts = await total(products);
    expect(nProducts).toBeGreaterThanOrEqual(13);
    expect(await total(barcodes)).toBeGreaterThan(0);
  });

  it("fiado en la calle: $ 73.800, con $ 46.800 vencidos en 3 clientes", async () => {
    const rows = await t.db.select().from(customerLedger);
    const byCustomer = new Map<string, typeof rows>();
    for (const r of rows)
      byCustomer.set(r.customerId, [...(byCustomer.get(r.customerId) ?? []), r]);
    const summaries = [...byCustomer.values()].map((entries) =>
      creditSummary(
        entries.map((e) => ({
          id: e.id,
          amountCents: e.amountCents,
          date: toDateStr(e.createdAt),
          dueOn: e.dueOn,
        })),
        TODAY,
      ),
    );
    const inStreet = summaries.reduce((s, x) => s + Math.max(0, x.balanceCents), 0);
    const overdue = summaries.filter((x) => x.overdueCents > 0);
    expect(inStreet).toBe(7_380_000);
    expect(overdue.reduce((s, x) => s + x.overdueCents, 0)).toBe(4_680_000);
    expect(overdue).toHaveLength(3);
    // El saldo guardado coincide con el libro.
    const [rosa] = await t.db.select().from(customers).where(eq(customers.name, "Rosa Giménez"));
    expect(rosa?.balanceCents).toBe(1_840_000);
    expect(rosa?.creditLimitCents).toBe(3_000_000);
  });

  it("el pedido 0042 a Lácteos del Sur suma $ 186.400 en 14 productos", async () => {
    const [order] = await t.db.select().from(purchaseOrders).where(eq(purchaseOrders.number, 42));
    expect(order?.totalCents).toBe(18_640_000);
    expect(order?.expectedOn).toBe("2026-10-08");
    const lines = await t.db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.orderId, order?.id ?? ""));
    expect(lines).toHaveLength(14);
    expect(lines.reduce((s, l) => s + (l.unitCostCents ?? 0) * l.qtyOrdered, 0)).toBe(18_640_000);
  });

  it("los productos tienen costo, precio y stock del escenario", async () => {
    const [yerba] = await t.db
      .select()
      .from(products)
      .where(eq(products.name, "Yerba Playadito 1 kg"));
    expect(yerba).toMatchObject({
      costCents: 485_000,
      priceCents: 690_000,
      stockQty: 3,
      minStock: 8,
    });
    expect(yerba?.marginBp).toBe(4227);
    const moves = await t.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, yerba?.id ?? ""));
    expect(moves.reduce((s, m) => s + m.qty, 0)).toBe(3);
    const [cig] = await t.db
      .select()
      .from(products)
      .where(eq(products.name, "Cigarrillos atado x 20"));
    expect(cig).toMatchObject({ fixedPrice: true, ageRestricted: true });
  });

  it("la factura de Lácteos del Sur vence mañana por $ 184.500", async () => {
    const invoices = await t.db.select().from(supplierInvoices);
    const lacteos = invoices.find((i) => i.amountCents === 18_450_000);
    expect(lacteos?.dueOn).toBe("2026-10-04");
    expect(invoices.reduce((s, i) => s + i.amountCents, 0)).toBe(
      (96_300 + 184_500 + 41_000 + 22_800) * 100,
    );
  });
});
