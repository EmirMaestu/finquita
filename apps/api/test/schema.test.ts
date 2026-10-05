import { newId } from "@mostrador/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  barcodes,
  categories,
  customerLedger,
  customers,
  members,
  products,
  registers,
  sales,
  stockMovements,
  syncOps,
} from "../src/db/schema/index";
import { createTestDb, type TestDb } from "./db";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.reset();
});

/** Postgres envuelve el error: el código queda en `cause`. */
function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.cause?.code ?? e.code;
}

async function expectUniqueViolation(p: Promise<unknown>) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).not.toBeNull();
  expect(pgCode(err)).toBe("23505");
}

async function product(name = "Yerba Playadito 1 kg") {
  const id = newId();
  await t.db.insert(products).values({ id, name, priceCents: 690000 });
  return id;
}

describe("esquema núcleo", () => {
  it("un código de barras pertenece a un solo producto", async () => {
    const a = await product("Yerba Playadito 1 kg");
    const b = await product("Yerba otra");
    await t.db.insert(barcodes).values({ id: newId(), productId: a, code: "7791234000012" });
    await expectUniqueViolation(
      t.db.insert(barcodes).values({ id: newId(), productId: b, code: "7791234000012" }),
    );
    // Un producto puede tener varios códigos.
    await t.db.insert(barcodes).values({ id: newId(), productId: a, code: "7791234000029" });
  });

  it("el op_id de sincronización es único", async () => {
    const opId = newId();
    const op = { opId, type: "sale.create", payload: {}, status: "applied" as const };
    await t.db.insert(syncOps).values(op);
    await expectUniqueViolation(t.db.insert(syncOps).values(op));
  });

  it("el código interno (PLU) no se repite entre productos activos", async () => {
    await t.db.insert(products).values({ id: newId(), name: "Pan francés", internalCode: "1001" });
    await expectUniqueViolation(
      t.db.insert(products).values({ id: newId(), name: "Otro pan", internalCode: "1001" }),
    );
    // Uno dado de baja libera el código.
    await t.db.insert(products).values({
      id: newId(),
      name: "Pan viejo",
      internalCode: "1002",
      deletedAt: new Date(),
    });
    await t.db.insert(products).values({ id: newId(), name: "Pan nuevo", internalCode: "1002" });
  });

  it("guarda cantidades con tres decimales y plata en centavos", async () => {
    const id = newId();
    await t.db.insert(products).values({
      id,
      name: "Pan francés",
      saleUnit: "kg",
      priceCents: 380000,
      stockQty: 6.4,
    });
    await t.db
      .insert(stockMovements)
      .values({ id: newId(), productId: id, kind: "sale", qty: -0.75 });
    const [p] = await t.db.select().from(products);
    expect(p?.stockQty).toBe(6.4);
    const [m] = await t.db.select().from(stockMovements);
    expect(m?.qty).toBe(-0.75);
    expect(p?.priceCents).toBe(380000);
  });

  it("no acepta precios negativos", async () => {
    const err = await t.db
      .insert(products)
      .values({ id: newId(), name: "X", priceCents: -1 })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(pgCode(err)).toBe("23514");
  });

  it("las ventas y la cuenta corriente referencian entidades existentes", async () => {
    const registerId = newId();
    const memberId = newId();
    const customerId = newId();
    await t.db.insert(registers).values({ id: registerId, name: "Caja 1", number: 1 });
    await t.db.insert(members).values({ id: memberId, name: "Tomás", role: "cashier" });
    await t.db.insert(customers).values({ id: customerId, name: "Rosa Giménez" });
    const saleId = newId();
    await t.db.insert(sales).values({
      id: saleId,
      registerId,
      number: 4187,
      memberId,
      customerId,
      subtotalCents: 670000,
      totalCents: 670000,
      deviceAt: new Date(),
    });
    await t.db.insert(customerLedger).values({
      id: newId(),
      customerId,
      kind: "sale",
      amountCents: 670000,
      saleId,
    });
    const fk = await t.db
      .insert(customerLedger)
      .values({ id: newId(), customerId: newId(), kind: "sale", amountCents: 1 })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(pgCode(fk)).toBe("23503");
  });

  it("las categorías tienen dos niveles", async () => {
    const parent = newId();
    await t.db.insert(categories).values({ id: parent, name: "Almacén", defaultMarginBp: 4000 });
    await t.db.insert(categories).values({ id: newId(), name: "Infusiones", parentId: parent });
    const rows = await t.db.select().from(categories);
    expect(rows.find((c) => c.name === "Infusiones")?.parentId).toBe(parent);
  });
});
