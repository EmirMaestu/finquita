import { describe, expect, it } from "vitest";
import { totalLabel } from "./greeting";

describe("web", () => {
  it("formatea el total con el paquete compartido", () => {
    expect(totalLabel(1855000)).toBe("Total $ 18.550");
  });
});
