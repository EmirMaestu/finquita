import { Hono } from "hono";
import type { AppEnv } from "../app";
import { requireActor } from "../auth/actor";
import { ApiError } from "../lib/errors";
import { suggestedName } from "../lib/off";

export const offRoutes = new Hono<AppEnv>();

/** Datos de Open Food Facts para el alta rápida: nombre y foto, si el código está en la base abierta. */
offRoutes.get("/off/:code", requireActor(), async (c) => {
  const code = c.req.param("code");
  if (!/^\d{8,14}$/.test(code))
    throw new ApiError(400, "bad_code", "Ese código no parece de un producto envasado.");
  const r = await c.get("off").lookup(code);
  if (r.status === "found") {
    return c.json({
      found: true,
      name: suggestedName(r.product),
      brand: r.product.brand,
      imageUrl: r.product.imageUrl,
      cached: r.cached,
    });
  }
  if (r.status === "not_found") return c.json({ found: false, cached: r.cached });
  if (r.status === "rate_limited")
    throw new ApiError(
      429,
      "rate_limited",
      "Muchas consultas seguidas: cargá el nombre a mano o probá en un minuto.",
    );
  throw new ApiError(503, "unavailable", "Open Food Facts no responde: cargá el nombre a mano.");
});
