import type { Permission } from "@mostrador/shared";
import type { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { type AppEnv, createApp } from "../src/app";
import { requirePermission } from "../src/auth/permissions";
import { memberPermissions } from "../src/db/schema/index";
import { as, authorizeWith, type MemberKey, memberId } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();

const PERMS: Permission[] = [
  "sell",
  "discount_over_cap",
  "void_sale",
  "open_drawer",
  "cash_movement",
  "credit_over_limit",
  "view_costs",
  "change_prices",
  "adjust_stock",
  "count_receive",
  "send_orders",
  "reports",
  "settings",
];

function build() {
  const app = createApp({ db: ref.t.db, auth: TEST_AUTH }) as unknown as Hono<AppEnv>;
  for (const p of PERMS) {
    app.post(`/api/_test/${p}`, requirePermission(p), (c) => c.json(c.get("authz")));
  }
  return app;
}

type Expect = "allow" | "deny" | "pin" | "approval" | "own";

/** Matriz del spec, fila por fila: dueño, encargado, cajero, repositor. */
const MATRIX: Record<string, [Expect, Expect, Expect, Expect]> = {
  sell: ["allow", "allow", "allow", "deny"],
  discount_over_cap: ["allow", "allow", "pin", "deny"],
  void_sale: ["allow", "allow", "pin", "deny"],
  open_drawer: ["allow", "allow", "pin", "deny"],
  cash_movement: ["allow", "allow", "pin", "deny"],
  credit_over_limit: ["allow", "allow", "pin", "deny"],
  view_costs: ["allow", "deny", "deny", "deny"],
  change_prices: ["allow", "allow", "deny", "deny"],
  adjust_stock: ["allow", "allow", "deny", "approval"],
  count_receive: ["allow", "allow", "deny", "allow"],
  send_orders: ["allow", "deny", "deny", "deny"],
  reports: ["allow", "allow", "own", "deny"],
  settings: ["allow", "deny", "deny", "deny"],
};

const ROLES: MemberKey[] = ["carlos", "julian", "tomas", "nico"];

describe("permisos en la API por rol", () => {
  for (const [perm, expected] of Object.entries(MATRIX)) {
    it(`${perm}: ${expected.join(" · ")}`, async () => {
      const app = build();
      for (const [i, key] of ROLES.entries()) {
        const c = await as(app, ref.t.db, key);
        const r = await c.post(`/api/_test/${perm}`);
        const want = expected[i];
        if (want === "deny") {
          expect(r.status, `${key}`).toBe(403);
          expect(r.body.error.code).toBe("forbidden");
          expect(r.body.error.details.whoCan).toBeTruthy();
        } else if (want === "pin") {
          expect(r.status, `${key}`).toBe(403);
          expect(r.body.error.code).toBe("pin_required");
        } else {
          expect(r.status, `${key}`).toBe(200);
          expect(r.body.grant).toBe(want);
        }
      }
    });
  }

  it("con el PIN de un encargado, el cajero anula y queda quién autorizó", async () => {
    const app = build();
    const tomas = await as(app, ref.t.db, "tomas");
    const r = await tomas.request("POST", "/api/_test/void_sale", {}, authorizeWith("julian"));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ grant: "allow", authorizedBy: memberId("julian") });
  });

  it("el PIN de otro cajero no autoriza", async () => {
    const app = build();
    const tomas = await as(app, ref.t.db, "tomas");
    const r = await tomas.request("POST", "/api/_test/void_sale", {}, authorizeWith("lucia"));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("pin_not_allowed");
  });

  it("un PIN equivocado no autoriza", async () => {
    const app = build();
    const tomas = await as(app, ref.t.db, "tomas");
    const r = await tomas.request(
      "POST",
      "/api/_test/cash_movement",
      {},
      {
        "x-authorize": `${memberId("julian")}:0000`,
      },
    );
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("pin_wrong");
  });

  it("los ajustes por persona: el dueño le da al encargado ver costos y le saca cambiar precios", async () => {
    await ref.t.db.insert(memberPermissions).values([
      { memberId: memberId("julian"), permission: "view_costs", value: "allow" },
      { memberId: memberId("julian"), permission: "change_prices", value: "deny" },
    ]);
    const app = build();
    const julian = await as(app, ref.t.db, "julian");
    expect((await julian.post("/api/_test/view_costs")).status).toBe(200);
    expect((await julian.post("/api/_test/change_prices")).status).toBe(403);
    const me = await julian.get("/api/me");
    expect(me.body.permissions).toMatchObject({
      view_costs: "allow",
      change_prices: "deny",
      reports_profitability: "allow",
    });
  });

  it("sin sesión responde 401", async () => {
    const r = await build().request("/api/_test/sell", { method: "POST" });
    expect(r.status).toBe(401);
  });
});
