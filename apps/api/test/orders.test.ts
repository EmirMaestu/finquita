import { newId } from "@mostrador/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { seedId } from "../src/seed/ids";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { product } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });
const LACTEOS = seedId("supplier:lacteos");
const ORDER_42 = seedId("order:0042");

describe("pedidos", () => {
  it("el 0042 trae el mensaje escrito y el enlace wa.me de Marcelo", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const r = await carlos.get(`/api/orders/${ORDER_42}`);
    expect(r.body).toMatchObject({
      number: 42,
      status: "draft",
      supplier: { name: "Lácteos del Sur", contactName: "Marcelo" },
      nextSteps: ["sent", "cancelled"],
    });
    expect(r.body.lines).toHaveLength(14);
    const { text, url } = r.body.message;
    expect(text.split("\n")[0]).toMatch(
      /^Hola Marcelo, te paso el pedido 0042 de Almacén La Esquina para el jueves \d+\/10:$/,
    );
    expect(text).toContain("• Leche entera 1 L sachet [LE-1L]: 24 u (2 cajones)");
    expect(text).toContain("14 productos, total estimado $ 186.400.");
    expect(url).toBe(`https://wa.me/5492614000002?text=${encodeURIComponent(text)}`);
  });

  it("estados a mano: enviado por WhatsApp, confirmado con cambios y cerrado no se salta", async () => {
    const julian = await as(app(), ref.t.db, "julian");
    const sent = await julian.post(`/api/orders/${ORDER_42}/status`, {
      status: "sent",
      via: "whatsapp",
    });
    expect(sent.body).toMatchObject({
      status: "sent",
      nextSteps: ["confirmed", "changed", "cancelled"],
    });
    expect(sent.body.sentAt).toBeTruthy();
    // El encargado no ve costos.
    expect(sent.body.totalCents).toBeUndefined();
    const ricota = sent.body.lines.find(
      (l: { description: string }) => l.description === "Ricota 500 g",
    );
    const conf = await julian.post(`/api/orders/${ORDER_42}/status`, {
      status: "confirmed",
      confirmed: [{ lineId: ricota.id, qty: 0 }],
      note: "No hay ricota",
    });
    expect(conf.body.status).toBe("changed");
    expect(conf.body.lines.find((l: { id: string }) => l.id === ricota.id).qtyConfirmed).toBe(0);
    const bad = await julian.post(`/api/orders/${ORDER_42}/status`, { status: "closed" });
    expect(bad.status).toBe(409);
    expect(bad.body.error.message).toBe("Un pedido confirmado con cambios no pasa a cerrado.");
    const detail = await julian.get(`/api/orders/${ORDER_42}`);
    expect(detail.body.timeline.map((t: { status: string }) => t.status)).toEqual([
      "draft",
      "sent",
      "changed",
    ]);
    expect(detail.body.timeline[1]).toMatchObject({ note: "Enviado por WhatsApp", by: "Julián" });
    // Lo ya pedido entra en el sugerido: la leche ya no hace falta.
    const sug = await julian.get(`/api/purchasing/suggested?supplierId=${LACTEOS}`);
    expect(
      sug.body[0].lines.find((l: { name: string }) => l.name === "Leche entera 1 L sachet"),
    ).toBeUndefined();
  });

  it("guardar borrador desde el sugerido: número siguiente y total con costos", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const r = await carlos.post("/api/orders", {
      supplierId: LACTEOS,
      expectedOn: "2026-10-08",
      lines: [
        { productId: product("leche"), qty: 24 },
        { productId: product("ricota"), qty: 4 },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      number: 43,
      status: "draft",
      totalCents: 24 * 135_000 + 4 * 180_000,
    });
    const edited = await carlos.patch(`/api/orders/${r.body.id}`, {
      lines: [{ productId: product("leche"), qty: 36 }],
    });
    expect(edited.body).toMatchObject({ totalCents: 36 * 135_000 });
    const list = await carlos.get("/api/orders?status=draft");
    expect(list.body.items.map((o: { number: number }) => o.number)).toEqual([43, 42]);
    expect(list.body.counts).toMatchObject({ draft: 2, sent: 1 });
  });

  it("descarga el PDF del pedido", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const res = await app().request(`http://localhost/api/orders/${ORDER_42}/pdf`, {
      headers: {
        "x-device-token": carlos.deviceToken ?? "",
        authorization: `Bearer ${carlos.pinToken}`,
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("pedido-0042.pdf");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("pedido fijo: se guarda la lista y arma el borrador del día", async () => {
    const julian = await as(app(), ref.t.db, "julian");
    const id = newId();
    const pan = seedId("supplier:panificadora");
    expect(
      (
        await julian.put(`/api/standing-orders/${id}`, {
          supplierId: pan,
          name: "Pan de todos los días",
          lines: [{ productId: product("pan"), qty: 8 }],
        })
      ).status,
    ).toBe(200);
    const list = await julian.get("/api/standing-orders");
    expect(list.body).toMatchObject([
      {
        name: "Pan de todos los días",
        supplierName: "Panificadora San Martín",
        lines: [{ name: "Pan francés", qty: 8, unit: "kg" }],
      },
    ]);
    const draft = await julian.post(`/api/standing-orders/${id}/draft`, {});
    expect(draft.status).toBe(201);
    expect(draft.body).toMatchObject({
      status: "draft",
      notes: "Pedido fijo: Pan de todos los días",
      lines: [{ description: "Pan francés", qtyOrdered: 8 }],
    });
    expect(draft.body.message).toBeUndefined();
    const full = await julian.get(`/api/orders/${draft.body.id}`);
    expect(full.body.message.text).toContain("• Pan francés: 8,000 kg");
  });

  it("el cajero no arma pedidos", async () => {
    const tomas = await as(app(), ref.t.db, "tomas");
    expect((await tomas.get("/api/orders")).status).toBe(403);
    expect(
      (
        await tomas.post("/api/orders", {
          supplierId: LACTEOS,
          lines: [{ productId: product("leche"), qty: 1 }],
        })
      ).status,
    ).toBe(403);
  });
});
