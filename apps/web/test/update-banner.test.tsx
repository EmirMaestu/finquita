import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UpdateBanner } from "../src/ui/UpdateBanner";

describe("UpdateBanner", () => {
  it("no aparece si no hay versión nueva", () => {
    render(<UpdateBanner needRefresh={false} saleInProgress={false} onUpdate={() => {}} />);
    expect(screen.queryByText("Hay una versión nueva")).not.toBeInTheDocument();
  });

  it("avisa y actualiza al tocar Actualizar", () => {
    const onUpdate = vi.fn();
    render(<UpdateBanner needRefresh saleInProgress={false} onUpdate={onUpdate} />);
    expect(screen.getByText("Hay una versión nueva")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("no se muestra durante una venta en curso", () => {
    render(<UpdateBanner needRefresh saleInProgress onUpdate={() => {}} />);
    expect(screen.queryByText("Hay una versión nueva")).not.toBeInTheDocument();
  });

  it("vuelve a aparecer cuando termina la venta", () => {
    const onUpdate = vi.fn();
    const view = (sale: boolean) => (
      <UpdateBanner needRefresh saleInProgress={sale} onUpdate={onUpdate} />
    );
    const { rerender } = render(view(true));
    expect(screen.queryByText("Hay una versión nueva")).not.toBeInTheDocument();
    rerender(view(false));
    expect(screen.getByText("Hay una versión nueva")).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("Después lo oculta sin actualizar", () => {
    const onUpdate = vi.fn();
    render(<UpdateBanner needRefresh saleInProgress={false} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole("button", { name: "Después" }));
    expect(screen.queryByText("Hay una versión nueva")).not.toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
