import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MoreFields } from "../src/ui/MoreFields";

describe("campos opcionales plegados", () => {
  it("arrancan cerrados y se abren si ya tienen datos", () => {
    const { container, rerender } = render(
      <MoreFields>
        <input aria-label="Apodo" />
      </MoreFields>,
    );
    expect(screen.getByText("Más datos (opcional)")).toBeTruthy();
    expect(container.querySelector("details")?.open).toBe(false);
    rerender(
      <MoreFields open>
        <input aria-label="Apodo" />
      </MoreFields>,
    );
    expect(container.querySelector("details")?.open).toBe(true);
  });
});
