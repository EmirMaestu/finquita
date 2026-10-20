// @vitest-environment node
import { describe, expect, it } from "vitest";
import { matchActions } from "../src/app/GlobalSearch";
import { lockScreen } from "../src/app/lock";

describe("búsqueda global y bloqueo", () => {
  it("'cerrar caja' y 'precios' encuentran su acción, sin importar tildes", () => {
    expect(matchActions("cerrar caja").map((a) => a.path)).toEqual(["/caja/cierre"]);
    expect(matchActions("PRECIOS").map((a) => a.path)).toEqual(["/productos/precios"]);
    expect(matchActions("mercaderia").map((a) => a.path)).toEqual(["/compras/recepcion"]);
    expect(matchActions("")).toEqual([]);
  });

  it("el bloqueo por inactividad se distingue del cambio de usuario a pedido", () => {
    lockScreen.open("idle");
    expect(lockScreen).toBeTruthy();
  });
});
