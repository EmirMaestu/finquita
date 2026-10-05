import { newId } from "@mostrador/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { audit, diff } from "../src/lib/audit";
import { seedId } from "../src/seed/ids";
import { as, ensureMac, memberId } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });

describe("diff", () => {
  it("guarda solo lo que cambió", () => {
    expect(
      diff(
        { name: "Yerba", priceCents: 650000, updatedAt: 1 },
        { name: "Yerba", priceCents: 690000, updatedAt: 2 },
      ),
    ).toEqual({ before: { priceCents: 650000 }, after: { priceCents: 690000 } });
  });
});

describe("auditoría", () => {
  it("el helper guarda quién, dispositivo, cuándo, antes y después", async () => {
    const deviceId = await ensureMac(ref.t.db);
    const productId = seedId("product:yerba");
    await audit(ref.t.db, {
      action: "product.price_changed",
      entityType: "product",
      entityId: productId,
      before: { priceCents: 650000 },
      after: { priceCents: 690000 },
      memberId: memberId("carlos"),
      deviceId,
      at: new Date("2026-10-03T21:00:00Z"),
    });
    const carlos = await as(app(), ref.t.db, "carlos");
    const r = await carlos.get(`/api/audit?entityType=product&entityId=${productId}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({
      action: "product.price_changed",
      before: { priceCents: 650000 },
      after: { priceCents: 690000 },
      memberName: "Carlos Díaz",
      deviceName: "Mac del mostrador",
      createdAt: "2026-10-03T21:00:00.000Z",
    });
  });

  it("filtra por usuario, tipo y fecha", async () => {
    const base = { entityType: "cash_movement", entityId: newId() };
    await audit(ref.t.db, {
      ...base,
      action: "cash.expense",
      memberId: memberId("tomas"),
      at: new Date("2026-10-03T18:00:00Z"),
    });
    await audit(ref.t.db, {
      ...base,
      action: "cash.withdrawal",
      memberId: memberId("julian"),
      at: new Date("2026-10-03T19:00:00Z"),
    });
    await audit(ref.t.db, {
      ...base,
      action: "cash.expense",
      memberId: memberId("tomas"),
      at: new Date("2026-10-02T15:00:00Z"),
    });
    await audit(ref.t.db, {
      action: "sale.voided",
      entityType: "sale",
      memberId: memberId("tomas"),
      at: new Date("2026-10-03T20:00:00Z"),
    });
    const carlos = await as(app(), ref.t.db, "carlos");

    const byMember = await carlos.get(`/api/audit?memberId=${memberId("tomas")}`);
    expect(byMember.body.map((e: { action: string }) => e.action)).toEqual([
      "sale.voided",
      "cash.expense",
      "cash.expense",
    ]);

    const byType = await carlos.get(
      "/api/audit?entityType=cash_movement&from=2026-10-03&to=2026-10-03",
    );
    expect(byType.body.map((e: { action: string }) => e.action)).toEqual([
      "cash.withdrawal",
      "cash.expense",
    ]);

    const byDay = await carlos.get("/api/audit?from=2026-10-02&to=2026-10-02");
    expect(byDay.body).toHaveLength(1);

    const limited = await carlos.get("/api/audit?limit=2");
    expect(limited.body).toHaveLength(2);
    const next = await carlos.get(`/api/audit?limit=10&before=${limited.body[1].createdAt}`);
    expect(next.body.length).toBeGreaterThanOrEqual(2);
  });

  it("solo el dueño ve Actividad", async () => {
    const julian = await as(app(), ref.t.db, "julian");
    expect((await julian.get("/api/audit")).status).toBe(403);
  });

  it("cambiar un PIN queda registrado sin guardar el PIN", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    await carlos.put(`/api/members/${memberId("tomas")}/pin`, { pin: "8642" });
    const r = await carlos.get("/api/audit?action=member.pin_changed");
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({ entityId: memberId("tomas"), memberName: "Carlos Díaz" });
    expect(JSON.stringify(r.body[0])).not.toContain("8642");
  });
});
