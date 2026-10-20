import { describe, expect, it } from "vitest";
import { parseDecimal, parseMoney } from "./money";
import { plural } from "./text";
import { assertOp, checkOp, OpValidationError } from "./validation";

const uuid = "01930000-0000-7000-8000-000000000001";

describe("validar antes de encolar, con mensajes de mostrador", () => {
  it("fondo negativo: la apertura no pasa y dice qué campo", () => {
    const errors = checkOp("cash.shift_open", {
      shiftId: uuid,
      registerId: uuid,
      openingFloatCents: -50000,
      counts: null,
      note: null,
    });
    expect(errors).toEqual([
      { path: "openingFloatCents", field: "Fondo inicial", message: "no puede ser negativo" },
    ]);
  });

  it("descuento −50 %: la venta no se cobra", () => {
    const errors = checkOp("sale.create", {
      id: uuid,
      registerId: uuid,
      shiftId: uuid,
      number: 1,
      customerId: null,
      lines: [
        {
          id: uuid,
          kind: "product",
          productId: uuid,
          description: "Coca",
          qty: 1,
          unit: "unit",
          unitPriceCents: 460000,
          discountCents: 0,
          totalCents: 460000,
        },
      ],
      payments: [{ id: uuid, method: "cash", amountCents: 690000, tenderedCents: 690000 }],
      subtotalCents: 460000,
      discountCents: -230000,
      surchargeCents: 0,
      totalCents: 690000,
      changeCents: 0,
      receiptType: "ticket",
    });
    expect(errors[0]).toEqual({
      path: "discountCents",
      field: "Descuento",
      message: "no puede ser negativo",
    });
  });

  it("nota de 5000 caracteres en el cierre: como mucho 500", () => {
    const errors = checkOp("cash.shift_close", {
      shiftId: uuid,
      countedCashCents: 0,
      counts: null,
      otherMedia: null,
      expectedCashCents: 0,
      differenceCents: 0,
      note: "x".repeat(5000),
      leftFloatCents: 0,
      withdrawnCents: 0,
    });
    expect(errors).toEqual([
      { path: "note", field: "Comentario", message: "como mucho 500 caracteres" },
    ]);
  });

  it("un retiro de $ 99.999.999 es demasiado", () => {
    const errors = checkOp("cash.movement", {
      id: uuid,
      shiftId: uuid,
      kind: "withdrawal",
      amountCents: 9_999_999_900 + 100,
      reason: "prueba",
    });
    expect(errors[0]?.field).toBe("Monto");
    expect(errors[0]?.message).toBe("no puede pasar de $ 99.999.999");
  });

  it("assertOp tira un error con el mensaje listo para mostrar", () => {
    expect(() =>
      assertOp("cash.movement", { id: uuid, shiftId: uuid, kind: "expense", amountCents: 100 }),
    ).toThrow(OpValidationError);
    try {
      assertOp("cash.movement", { id: uuid, shiftId: uuid, kind: "expense", amountCents: 100 });
    } catch (e) {
      expect((e as Error).message).toBe("Motivo: falta");
    }
  });
});

describe("números tipeados a la argentina (y con punto decimal)", () => {
  it("plata: 1.000,50 y 1000.50 valen lo mismo; 1.000 son mil", () => {
    expect(parseMoney("1.000,50")).toBe(100050);
    expect(parseMoney("1000.50")).toBe(100050);
    expect(parseMoney("1000,5")).toBe(100050);
    expect(parseMoney("1.000")).toBe(100000);
    expect(parseMoney("12.345.678")).toBe(1234567800);
    expect(parseMoney("-500")).toBe(-50000);
    expect(parseMoney("abc")).toBeNull();
  });
  it("cantidades: 1,5 · 1.5 · 1.000,5 · 1.000", () => {
    expect(parseDecimal("1,5")).toBe(1.5);
    expect(parseDecimal("1.5")).toBe(1.5);
    expect(parseDecimal("1.000,5")).toBe(1000.5);
    expect(parseDecimal("1000.50")).toBe(1000.5);
    expect(parseDecimal("1.000")).toBe(1000);
    expect(parseDecimal("-5")).toBe(-5);
    expect(parseDecimal("🧀")).toBeNull();
    expect(parseDecimal("")).toBeNull();
  });
  it("plurales", () => {
    expect(plural(1, "ítem", "ítems")).toBe("1 ítem");
    expect(plural(3, "ítem", "ítems")).toBe("3 ítems");
  });
});

describe("lo que pegó el destructor en la ronda 2", () => {
  it("el fondo que queda no puede pasar lo contado", () => {
    const errors = checkOp("cash.shift_close", {
      shiftId: uuid,
      countedCashCents: 14_227_000,
      counts: null,
      otherMedia: null,
      expectedCashCents: 14_227_000,
      differenceCents: 0,
      note: null,
      leftFloatCents: 99_999_900,
      withdrawnCents: 0,
    });
    expect(errors).toEqual([
      {
        path: "leftFloatCents",
        field: "Fondo que queda",
        message: "No puede quedar más de lo contado",
      },
    ]);
  });

  it("un producto por unidad no tiene stock 1,5 ni mínimo −2 ni código abc", () => {
    const errors = checkOp("product.upsert", {
      id: uuid,
      changes: { name: "Nuevo", saleUnit: "unit", priceCents: 100, minStock: -2 },
      barcodes: ["abc", "123"],
      initialStock: 1.5,
    });
    expect(errors.map((e) => `${e.field}: ${e.message}`)).toEqual([
      "Stock mínimo: No puede ser negativo",
      "Códigos de barras: Un código de barras tiene de 4 a 14 números",
      "Códigos de barras: Un código de barras tiene de 4 a 14 números",
      "Stock inicial: Se vende por unidad: tiene que ser un número entero",
    ]);
  });

  it("recepción: no hay más dañados que recibidos ni vencimiento en 2020", () => {
    const errors = checkOp("receipt.confirm", {
      id: uuid,
      kind: "order",
      lines: [{ id: uuid, productId: uuid, qty: 5, damagedQty: 10, expiresOn: "2020-01-01" }],
    });
    expect(errors.map((e) => `${e.field}: ${e.message}`)).toEqual([
      "Ítem 1 · Dañados: No puede haber más dañados que recibidos",
      "Ítem 1 · Vencimiento: Ya pasó: revisá la fecha",
    ]);
  });

  it("cliente: teléfono 'abc-123' y DNI 'abc' no se guardan", () => {
    const errors = checkOp("customer.upsert", {
      id: uuid,
      changes: { name: "Cliente", phone: "abc-123", dni: "abc" },
    });
    expect(errors.map((e) => e.field)).toEqual(["Teléfono", "DNI"]);
  });
});
