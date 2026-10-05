import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { routes } from "../src/app/routes";
import { layoutFor } from "../src/app/useViewport";
import { renderRoutes, setViewport } from "./render";

describe("layout", () => {
  it("elige el diseño según el ancho", () => {
    expect(layoutFor(393)).toBe("phone");
    expect(layoutFor(800)).toBe("tablet");
    expect(layoutFor(1280)).toBe("desktop");
    expect(layoutFor(1440)).toBe("wide");
  });

  it("en iPhone (393 px) muestra la barra inferior de cinco lugares", () => {
    setViewport(393);
    const { container } = renderRoutes(routes, { path: "/inicio" });
    expect(container.querySelector("[data-layout='phone']")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Módulos" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Inicio",
      "Vender",
      "Productos",
      "Compras",
      "Más",
    ]);
    expect(screen.getByRole("heading", { level: 1, name: "Inicio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escanear" })).toBeInTheDocument();
  });

  it("en iPhone oculta Vender si el rol no vende", () => {
    setViewport(393);
    renderRoutes(routes, {
      path: "/inicio",
      shell: { visibleModules: ["inicio", "productos", "compras"] },
    });
    const nav = screen.getByRole("navigation", { name: "Módulos" });
    expect(within(nav).queryByText("Vender")).not.toBeInTheDocument();
  });

  it("en Mac (1280 px) muestra la barra lateral con los tres grupos", () => {
    setViewport(1280);
    const { container } = renderRoutes(routes, {
      path: "/caja",
      shell: {
        businessName: "Almacén La Esquina",
        register: { open: true, cashier: "Tomás", since: "14:00" },
      },
    });
    expect(container.querySelector("[data-layout='desktop']")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Módulos" });
    for (const g of ["Mostrador", "Mercadería", "Gestión"]) {
      expect(within(nav).getByText(g)).toBeInTheDocument();
    }
    expect(within(nav).getAllByRole("link")).toHaveLength(8);
    expect(within(nav).getByRole("link", { name: "Caja" })).toHaveClass("text-primario");
    expect(screen.getByText("Caja abierta · Tomás · desde 14:00")).toBeInTheDocument();
    expect(screen.getByText("Almacén La Esquina")).toBeInTheDocument();
  });

  it("en Mac, Vender va en modo mostrador: sin barra lateral", () => {
    setViewport(1280);
    const { container } = renderRoutes(routes, { path: "/vender" });
    expect(container.querySelector("[data-mode='counter']")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Módulos" })).not.toBeInTheDocument();
  });

  it("el chip de conexión cuenta las ventas por sincronizar", () => {
    setViewport(1280);
    renderRoutes(routes, { path: "/inicio", shell: { connection: { online: false, pending: 3 } } });
    expect(screen.getByText("Sin conexión · 3 ventas por sincronizar")).toBeInTheDocument();
  });

  it("en celular, Más lista los módulos restantes", () => {
    setViewport(393);
    renderRoutes(routes, { path: "/mas" });
    const main = screen.getByRole("main");
    expect(
      within(main)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Caja", "Clientes y fiado", "Reportes", "Ajustes"]);
  });
});
