import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InstallGuide, shouldShowInstallGuide } from "../src/ui/InstallGuide";

const iphoneSafari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const macChrome =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36";

describe("guía de instalación en iPhone", () => {
  it("aparece en Safari de iPhone sin instalar", () => {
    expect(
      shouldShowInstallGuide({ userAgent: iphoneSafari, standalone: false, maxTouchPoints: 5 }),
    ).toBe(true);
  });
  it("no aparece si ya está instalada ni en la Mac", () => {
    expect(
      shouldShowInstallGuide({ userAgent: iphoneSafari, standalone: true, maxTouchPoints: 5 }),
    ).toBe(false);
    expect(
      shouldShowInstallGuide({ userAgent: macChrome, standalone: false, maxTouchPoints: 0 }),
    ).toBe(false);
  });
  it("muestra los dos pasos", () => {
    render(
      <InstallGuide env={{ userAgent: iphoneSafari, standalone: false, maxTouchPoints: 5 }} />,
    );
    expect(screen.getByText(/Tocá Compartir/)).toBeInTheDocument();
    expect(screen.getByText(/Agregar a inicio/)).toBeInTheDocument();
  });
});
