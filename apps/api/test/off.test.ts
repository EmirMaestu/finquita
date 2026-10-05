import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { OffClient, suggestedName } from "../src/lib/off";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();

function offResponse(product: Record<string, unknown> | null) {
  return new Response(JSON.stringify(product ? { status: 1, product } : { status: 0 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("proxy de Open Food Facts", () => {
  it("se identifica con su User-Agent, normaliza y guarda en caché", async () => {
    const fetch = vi.fn(async () =>
      offResponse({
        product_name: "Criollitas",
        brands: "Bagley, Arcor",
        quantity: "169 g",
        image_front_small_url: "https://img/x.jpg",
      }),
    );
    const app = createApp({
      db: ref.t.db,
      auth: TEST_AUTH,
      off: { fetch, userAgent: "Mostrador/0.1 (test)" },
    });
    const c = await as(app, ref.t.db, "tomas");
    const r = await c.get("/api/off/7790040377605");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      found: true,
      name: "Criollitas Bagley 169 g",
      brand: "Bagley",
      imageUrl: "https://img/x.jpg",
      cached: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/v2/product/7790040377605.json");
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("Mostrador/0.1 (test)");
    // La segunda vez sale de la caché.
    const again = await c.get("/api/off/7790040377605");
    expect(again.body.cached).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("también guarda los códigos que no están", async () => {
    const fetch = vi.fn(async () => offResponse(null));
    const off = new OffClient(ref.t.db, { fetch });
    expect(await off.lookup("7790000009999")).toEqual({ status: "not_found", cached: false });
    expect(await off.lookup("7790000009999")).toEqual({ status: "not_found", cached: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("no pasa de 15 consultas por minuto", async () => {
    let t = 1_000_000;
    const fetch = vi.fn(async () => offResponse(null));
    const off = new OffClient(ref.t.db, { fetch, now: () => t });
    for (let i = 0; i < 15; i++)
      expect((await off.lookup(`77900000100${String(i).padStart(2, "0")}`)).status).toBe(
        "not_found",
      );
    expect(await off.lookup("7790000010099")).toEqual({ status: "rate_limited" });
    expect(fetch).toHaveBeenCalledTimes(15);
    t += 61_000;
    expect((await off.lookup("7790000010099")).status).toBe("not_found");
  });

  it("si no responde, avisa sin romper el alta", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("timeout");
    });
    const app = createApp({ db: ref.t.db, auth: TEST_AUTH, off: { fetch } });
    const c = await as(app, ref.t.db, "tomas");
    const r = await c.get("/api/off/7790000001017");
    expect(r.status).toBe(503);
    expect(r.body.error.message).toContain("a mano");
    expect((await c.get("/api/off/abc")).status).toBe(400);
  });

  it("arma el nombre sugerido sin repetir marca ni cantidad", () => {
    expect(
      suggestedName({
        name: "Yerba Playadito 1 kg",
        brand: "Playadito",
        quantity: "1 kg",
        imageUrl: null,
      }),
    ).toBe("Yerba Playadito 1 kg");
    expect(
      suggestedName({
        name: "Leche entera",
        brand: "La Serenísima",
        quantity: "1 L",
        imageUrl: null,
      }),
    ).toBe("Leche entera La Serenísima 1 L");
  });
});
