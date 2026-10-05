import { effectiveGrant } from "@mostrador/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { loadOverrides, requirePermission } from "../auth/permissions";
import { suggestedOrders } from "../domain/suggested";
import { validate } from "../lib/validate";

export const purchasingRoutes = new Hono<AppEnv>();

/** Pedido sugerido: con `supplierId`, el detalle de ese proveedor; sin él, el resumen de todos. */
purchasingRoutes.get(
  "/purchasing/suggested",
  requireActor(),
  requirePermission("build_orders"),
  validate("query", z.object({ supplierId: z.uuid().optional() })),
  async (c) => {
    const { supplierId } = c.req.valid("query");
    const { member } = actorOf(c);
    const costs =
      effectiveGrant(member.role, "view_costs", await loadOverrides(c.get("db"), member.id)) ===
      "allow";
    const all = await suggestedOrders(c.get("db"), { supplierId });
    const hide = <T extends { costCents: number | null }>(l: T) =>
      costs ? l : { ...l, costCents: undefined };
    return c.json(
      all.map((o) => ({
        ...o,
        lines: supplierId ? o.lines.map(hide) : undefined,
        count: o.lines.length,
        totalCents: costs ? o.totalCents : undefined,
      })),
    );
  },
);
