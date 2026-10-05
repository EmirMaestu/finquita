import { describe, expect, it } from "vitest";
import { canAuthorize, effectiveGrant, effectiveGrants, whoCan } from "./permissions";

describe("matriz de permisos", () => {
  it("el dueño puede todo, siempre", () => {
    expect(Object.values(effectiveGrants("owner", { settings: "deny" }))).toEqual(
      Array(19).fill("allow"),
    );
  });

  it("los ajustes por persona pisan el rol", () => {
    expect(effectiveGrant("manager", "view_costs")).toBe("deny");
    expect(effectiveGrant("manager", "view_costs", { view_costs: "allow" })).toBe("allow");
    expect(effectiveGrant("cashier", "count_receive", { count_receive: "allow" })).toBe("allow");
  });

  it("la rentabilidad del encargado depende de ver costos", () => {
    expect(effectiveGrant("manager", "reports_profitability")).toBe("deny");
    expect(effectiveGrant("manager", "reports_profitability", { view_costs: "allow" })).toBe(
      "allow",
    );
    expect(effectiveGrant("cashier", "reports_profitability", { view_costs: "allow" })).toBe(
      "deny",
    );
  });

  it("dice qué rol puede", () => {
    expect(whoCan("settings")).toBe("Dueño");
    expect(whoCan("change_prices")).toBe("Dueño o Encargado");
    expect(whoCan("sell")).toBe("Dueño, Encargado o Cajero");
  });

  it("autoriza con PIN un encargado o el dueño", () => {
    expect(canAuthorize("manager", "void_sale")).toBe(true);
    expect(canAuthorize("cashier", "void_sale")).toBe(false);
    expect(canAuthorize("manager", "void_sale", { void_sale: "deny" })).toBe(false);
  });
});
