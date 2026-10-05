import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LocalProduct } from "../src/data/types";
import { WeightDialog } from "../src/pages/sell/WeightDialog";

const product = (name: string, priceCents: number) =>
  ({ id: name, name, priceCents, saleUnit: "kg", internalCode: "2010" }) as unknown as LocalProduct;

function type(keys: string) {
  for (const k of keys) fireEvent.click(screen.getByRole("button", { name: k }));
}

describe("teclado de peso", () => {
  it("por peso: 750 son 0,750 kg × $ 3.800 = $ 2.850", () => {
    const onAdd = vi.fn();
    render(
      <WeightDialog product={product("Pan francés", 380000)} onAdd={onAdd} onClose={() => {}} />,
    );
    type("750");
    expect(screen.getByRole("status", { name: "Peso" })).toHaveTextContent("0,750 kg");
    fireEvent.click(screen.getByRole("button", { name: /Agregar \$ 2\.850/ }));
    expect(onAdd).toHaveBeenCalledWith(0.75);
  });

  it("atajos de 100 g, ¼ kg y ½ kg", () => {
    render(
      <WeightDialog
        product={product("Jamón cocido", 2100000)}
        onAdd={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "¼ kg" }));
    expect(screen.getByRole("status", { name: "Peso" })).toHaveTextContent("0,250 kg");
    expect(screen.getByRole("button", { name: /Agregar \$ 5\.250/ })).toBeInTheDocument();
  });

  it("por plata: $ 2.000 de queso cremoso → cortá 148 g, y se cobra el peso real", () => {
    const onAdd = vi.fn();
    render(
      <WeightDialog
        product={product("Queso cremoso", 1350000)}
        onAdd={onAdd}
        onClose={() => {}}
        initialMode="money"
      />,
    );
    type("2000");
    expect(screen.getByRole("status", { name: "Para cortar" })).toHaveTextContent("Cortá 148 g");
    fireEvent.click(screen.getByRole("button", { name: /Ya corté/ }));
    // La balanza marcó 152 g: se corrige el peso.
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    type("152");
    expect(screen.getByRole("button", { name: /Agregar \$ 2\.052/ })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith(0.152);
  });
});
