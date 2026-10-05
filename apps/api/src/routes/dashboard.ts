import { effectiveGrant } from "@mostrador/shared";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { actorOf, requireActor } from "../auth/actor";
import { loadOverrides, requirePermission } from "../auth/permissions";
import { dashboard, stockerTasks } from "../domain/dashboard";

export const dashboardRoutes = new Hono<AppEnv>();

/** Panel del día: dueño y encargado (el margen, solo con permiso de ver costos). */
dashboardRoutes.get("/dashboard", requireActor(), requirePermission("reports"), async (c) => {
  const { member } = actorOf(c);
  if (member.role === "cashier")
    return c.json(
      { error: { code: "forbidden", message: "El cajero entra directo a Vender." } },
      403,
    );
  const costs =
    effectiveGrant(member.role, "view_costs", await loadOverrides(c.get("db"), member.id)) ===
    "allow";
  return c.json(await dashboard(c.get("db"), { costs }));
});

/** "Tus tareas" del repositor (y de quien cuente o reciba). */
dashboardRoutes.get(
  "/dashboard/tasks",
  requireActor(),
  requirePermission("count_receive"),
  async (c) => {
    const { member } = actorOf(c);
    return c.json(await stockerTasks(c.get("db"), member.id));
  },
);
