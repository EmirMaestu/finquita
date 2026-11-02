import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PaymentDialog } from "../src/pages/sell/PaymentDialog";

function open(totalCents: number) {
  const onConfirm = vi.fn();
  render(
    <PaymentDialog
      saleLabel="Venta en curso"
      itemCount={3}
      totalCents={totalCents}
      fiado={null}
      onConfirm={onConfirm}
      onClose={() => {}}
    />,
  );
  return onConfirm;
}

describe("cobro", () => {
  it("al abrir, el efectivo justo cubre todo: no dice que falta todo y recibido a la vez", () => {
    open(2_535_000);
    expect(screen.getByRole("status", { name: "Monto" })).toHaveTextContent("$ 25.350");
    expect(screen.queryByText("Falta")).toBeNull();
    expect(screen.getByText("Recibido en efectivo · justo")).toBeInTheDocument();
    // Con una parte pagada, "Falta" muestra lo que queda.
    fireEvent.click(screen.getByRole("button", { name: "$ 10.000" }));
    fireEvent.click(screen.getByRole("button", { name: /Agregar pago/ }));
    expect(screen.getByText("Falta").parentElement).toHaveTextContent("$ 15.350");
  });

  it("los billetes rápidos suman: $ 20.000 + $ 10.000 = $ 30.000, vuelto $ 4.650", () => {
    open(2_535_000);
    fireEvent.click(screen.getByRole("button", { name: "$ 20.000" }));
    fireEvent.click(screen.getByRole("button", { name: "$ 10.000" }));
    expect(screen.getByRole("status", { name: "Monto" })).toHaveTextContent("$ 30.000");
    expect(screen.getByRole("status", { name: "Vuelto" })).toHaveTextContent("$ 4.650");
  });

  it("con crédito +10 %, el monto a cobrar en el posnet incluye el recargo: $ 13.300 → $ 14.630", () => {
    const onConfirm = open(1_330_000);
    fireEvent.click(screen.getByRole("button", { name: /Tarjeta/ }));
    fireEvent.click(screen.getByRole("button", { name: /Crédito/ }));
    expect(screen.getByRole("status", { name: "Monto" })).toHaveTextContent("$ 14.630");
    expect(screen.getByText(/Cobrá con crédito · incluye recargo \$ 1\.330/)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Total a cobrar" })).toHaveTextContent("$ 14.630");
    fireEvent.click(screen.getByRole("button", { name: /Confirmar cobro/ }));
    expect(onConfirm).toHaveBeenCalled();
    const [tenders, surcharge] = onConfirm.mock.calls[0] as [{ amountCents: number }[], number];
    expect(tenders[0]?.amountCents).toBe(1_463_000);
    expect(surcharge).toBe(133_000);
  });

  it("Enter sobre Tarjeta enfocada elige Tarjeta en vez de cobrar", () => {
    const onConfirm = open(1_000_000);
    const card = screen.getByRole("button", { name: /Tarjeta/ });
    card.focus();
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(card);
    expect(card).toHaveAttribute("aria-pressed", "true");
  });
});
