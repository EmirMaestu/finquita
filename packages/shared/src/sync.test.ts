import { describe, expect, it } from "vitest";
import { newId } from "./ids";
import {
  isClockSkewed,
  MAX_PUSH_BATCH,
  mergeFields,
  OP_TYPES,
  type OpType,
  parseOp,
  pushRequest,
} from "./sync";

const id = () => newId();
const env = (type: OpType, payload: unknown) => ({
  opId: id(),
  memberId: id(),
  deviceAt: "2026-10-03T18:41:00-03:00",
  type,
  payload,
});

/** Venta del flujo 1: total $ 18.550, efectivo $ 20.000, vuelto $ 1.450. */
function sale() {
  return {
    id: id(),
    registerId: id(),
    shiftId: id(),
    number: 4187,
    lines: [
      {
        id: id(),
        productId: id(),
        description: "Coca-Cola 2,25 L",
        qty: 1,
        unitPriceCents: 460000,
        totalCents: 460000,
      },
      {
        id: id(),
        productId: id(),
        description: "Pan francés",
        qty: 0.75,
        unit: "kg",
        unitPriceCents: 380000,
        totalCents: 285000,
      },
      {
        id: id(),
        productId: id(),
        description: "Jamón cocido",
        qty: 0.2,
        unit: "kg",
        unitPriceCents: 2100000,
        totalCents: 420000,
      },
      {
        id: id(),
        productId: id(),
        description: "Yerba Playadito 1 kg",
        qty: 1,
        unitPriceCents: 690000,
        totalCents: 690000,
      },
    ],
    payments: [{ id: id(), method: "cash", amountCents: 2000000, tenderedCents: 2000000 }],
    subtotalCents: 1855000,
    totalCents: 1855000,
    changeCents: 145000,
  };
}

const VALID: Record<OpType, () => unknown> = {
  "sale.create": sale,
  "sale.void": () => ({ saleId: id(), reason: "Error de cobro" }),
  "sale.return": () => ({
    id: id(),
    saleId: id(),
    reason: "expired",
    refundMethod: "cash",
    shiftId: id(),
    lines: [{ id: id(), saleLineId: id(), qty: 1, totalCents: 260000, destination: "waste" }],
    totalCents: 260000,
  }),
  "cash.shift_open": () => ({
    shiftId: id(),
    registerId: id(),
    openingFloatCents: 2000000,
    counts: { "1000": 20 },
  }),
  "cash.movement": () => ({
    id: id(),
    shiftId: id(),
    kind: "expense",
    amountCents: 450000,
    reason: "Artículos de limpieza",
    category: "cleaning",
  }),
  "cash.shift_close": () => ({
    shiftId: id(),
    countedCashCents: 12070000,
    expectedCashCents: 12190000,
    differenceCents: -120000,
    note: "Faltó cambio",
    leftFloatCents: 2000000,
    withdrawnCents: 10070000,
  }),
  "stock.adjust": () => ({ id: id(), productId: id(), qty: -2, reason: "breakage" }),
  "product.upsert": () => ({
    id: id(),
    changes: { name: "Galletitas", priceCents: 150000 },
    barcodes: ["7790895000782"],
  }),
  "customer.upsert": () => ({
    id: id(),
    changes: { name: "Rosa Giménez", creditLimitCents: 3000000 },
  }),
  "credit.payment": () => ({
    id: id(),
    customerId: id(),
    amountCents: 2000000,
    method: "cash",
    shiftId: id(),
  }),
  "shortage.note": () => ({ id: id(), productId: id(), note: "Se terminó la lavandina" }),
};

/** Un caso inválido por tipo, con el campo que tiene que marcar. */
const INVALID: Record<OpType, [() => unknown, string]> = {
  "sale.create": [() => ({ ...sale(), changeCents: 0 }), "payments"],
  "sale.void": [() => ({ saleId: id(), reason: "" }), "reason"],
  "sale.return": [() => ({ ...(VALID["sale.return"]() as object), lines: [] }), "lines"],
  "cash.shift_open": [
    () => ({ shiftId: id(), registerId: id(), openingFloatCents: -1 }),
    "openingFloatCents",
  ],
  "cash.movement": [
    () => ({ id: id(), shiftId: id(), kind: "expense", amountCents: 450000, reason: "" }),
    "reason",
  ],
  "cash.shift_close": [() => ({ shiftId: id(), countedCashCents: 1.5 }), "countedCashCents"],
  "stock.adjust": [() => ({ id: id(), productId: id(), reason: "waste" }), "qty"],
  "product.upsert": [() => ({ id: id(), changes: { priceCents: -100 } }), "priceCents"],
  "customer.upsert": [() => ({ id: "no-es-uuid", changes: {} }), "id"],
  "credit.payment": [
    () => ({ id: id(), customerId: id(), amountCents: 0, method: "cash", shiftId: null }),
    "amountCents",
  ],
  "shortage.note": [() => ({ id: id() }), "productId"],
};

describe("protocolo de sincronización", () => {
  it("cubre todos los tipos de operación", () => {
    expect(Object.keys(VALID).sort()).toEqual([...OP_TYPES].sort());
  });

  for (const type of OP_TYPES) {
    it(`${type}: valida lo correcto y rechaza lo inválido`, () => {
      const ok = parseOp(env(type, VALID[type]()));
      expect(ok.ok, ok.ok ? "" : ok.reason).toBe(true);
      const [bad, field] = INVALID[type];
      const op = env(type, bad());
      const r = parseOp(op);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.opId).toBe(op.opId);
        expect(r.reason).toContain(field);
      }
    });
  }

  it("rechaza tipos desconocidos y op_id inválidos", () => {
    expect(parseOp({ ...env("sale.void", VALID["sale.void"]()), type: "sale.borrar" }).ok).toBe(
      false,
    );
    const r = parseOp({ ...env("sale.void", VALID["sale.void"]()), opId: "x" });
    expect(r).toMatchObject({ ok: false, opId: null });
  });

  it("la venta exige que los totales cierren", () => {
    expect(parseOp(env("sale.create", { ...sale(), subtotalCents: 1 })).ok).toBe(false);
    expect(parseOp(env("sale.create", { ...sale(), totalCents: 1 })).ok).toBe(false);
    const fiado = {
      ...sale(),
      changeCents: 0,
      payments: [{ id: id(), method: "account", amountCents: 1855000 }],
    };
    const r = parseOp(env("sale.create", fiado));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("customerId");
    expect(parseOp(env("sale.create", { ...fiado, customerId: id() })).ok).toBe(true);
  });

  it("las cantidades tienen hasta tres decimales", () => {
    const s = sale();
    const line = s.lines[1];
    if (line) line.qty = 0.7505;
    expect(parseOp(env("sale.create", s)).ok).toBe(false);
  });

  it("los lotes van de 1 a 100 operaciones", () => {
    const now = new Date().toISOString();
    expect(pushRequest.safeParse({ deviceNow: now, ops: [] }).success).toBe(false);
    expect(
      pushRequest.safeParse({ deviceNow: now, ops: Array(MAX_PUSH_BATCH).fill({}) }).success,
    ).toBe(true);
    expect(
      pushRequest.safeParse({ deviceNow: now, ops: Array(MAX_PUSH_BATCH + 1).fill({}) }).success,
    ).toBe(false);
  });
});

describe("reglas de conflicto", () => {
  it("marca relojes que difieren más de 5 minutos", () => {
    const server = new Date("2026-10-03T21:40:00Z");
    expect(isClockSkewed(new Date("2026-10-03T21:44:00Z"), server)).toBe(false);
    expect(isClockSkewed(new Date("2026-10-03T21:46:00Z"), server)).toBe(true);
  });

  it("edición concurrente: gana el último campo por campo y avisa qué pisó", () => {
    const current = { name: "Yerba Playadito 1 kg", priceCents: 720000, location: "Góndola 3" };
    const r = mergeFields(
      current,
      { priceCents: 700000, location: "Góndola 4" },
      { priceCents: 690000, location: "Góndola 3" },
    );
    expect(r.apply).toEqual({ priceCents: 700000, location: "Góndola 4" });
    expect(r.overwritten).toEqual(["priceCents"]);
    expect(mergeFields(current, { name: "Yerba Playadito 1 kg" }).apply).toEqual({});
  });
});
