import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../src/ui/Button";
import { Sheet } from "../src/ui/Sheet";

describe("hojas: Enter en un campo usa el botón principal", () => {
  it("Enter guarda; un botón de peligro o secundario no se toca", () => {
    const save = vi.fn();
    const cancel = vi.fn();
    render(
      <Sheet
        open
        onClose={() => {}}
        title="Proveedor"
        footer={
          <>
            <Button variant="secondary" onClick={cancel}>
              Cancelar
            </Button>
            <Button onClick={save}>Guardar proveedor</Button>
          </>
        }
      >
        <input aria-label="Nombre" />
      </Sheet>,
    );
    fireEvent.keyDown(screen.getByLabelText("Nombre"), { key: "Enter" });
    expect(save).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("sin primaria (por ejemplo, Sí, quitar), Enter no hace nada", () => {
    const remove = vi.fn();
    render(
      <Sheet
        open
        onClose={() => {}}
        title="Quitar"
        footer={
          <Button variant="danger" onClick={remove}>
            Sí, quitar
          </Button>
        }
      >
        <input aria-label="Nota" />
      </Sheet>,
    );
    fireEvent.keyDown(screen.getByLabelText("Nota"), { key: "Enter" });
    expect(remove).not.toHaveBeenCalled();
  });
});
