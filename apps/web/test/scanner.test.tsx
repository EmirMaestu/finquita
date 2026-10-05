import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pluFromInternalBarcode } from "../src/data/catalog";
import { createRepeatFilter } from "../src/scan/camera";
import { createScanDetector, stripScanLeak, useScanner } from "../src/scan/useScanner";

/** Teclea un texto con un intervalo fijo entre teclas (ms) sobre el detector. */
function typeOn(
  d: ReturnType<typeof createScanDetector>,
  clock: { t: number },
  text: string,
  gap: number,
) {
  const used: boolean[] = [];
  for (const key of text) {
    clock.t += gap;
    used.push(d.keydown({ key, ctrlKey: false, metaKey: false, altKey: false }));
  }
  return used;
}

describe("detector de pistola por velocidad de tipeo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("una ráfaga rápida terminada en Enter es un código", () => {
    const clock = { t: 0 };
    const onScan = vi.fn();
    const d = createScanDetector({ onScan, now: () => clock.t });
    const used = typeOn(d, clock, "7791234000012", 8);
    clock.t += 8;
    expect(d.keydown({ key: "Enter", ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
    expect(onScan).toHaveBeenCalledWith("7791234000012");
    // El primer carácter pasa; desde el segundo se frena la escritura.
    expect(used[0]).toBe(false);
    expect(used.slice(1).every(Boolean)).toBe(true);
  });

  it("una persona tipeando no dispara un escaneo", () => {
    const clock = { t: 0 };
    const onScan = vi.fn();
    const d = createScanDetector({ onScan, now: () => clock.t });
    const used = typeOn(d, clock, "yerba", 140);
    clock.t += 140;
    expect(d.keydown({ key: "Enter", ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
    expect(onScan).not.toHaveBeenCalled();
    expect(used.every((u) => !u)).toBe(true);
  });

  it("sin Enter, la ráfaga termina sola después de un silencio", () => {
    const clock = { t: 0 };
    const onScan = vi.fn();
    const d = createScanDetector({ onScan, now: () => clock.t, idleMs: 80 });
    typeOn(d, clock, "7790000001017", 10);
    expect(onScan).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onScan).toHaveBeenCalledWith("7790000001017");
  });

  it("códigos cortos no cuentan (por ejemplo, un número de cantidad)", () => {
    const clock = { t: 0 };
    const onScan = vi.fn();
    const d = createScanDetector({ onScan, now: () => clock.t, minLength: 4 });
    typeOn(d, clock, "12", 5);
    clock.t += 5;
    d.keydown({ key: "Enter", ctrlKey: false, metaKey: false, altKey: false });
    expect(onScan).not.toHaveBeenCalled();
  });

  it("los atajos con Ctrl no se confunden con un código", () => {
    const clock = { t: 0 };
    const onScan = vi.fn();
    const d = createScanDetector({ onScan, now: () => clock.t });
    typeOn(d, clock, "779", 5);
    d.keydown({ key: "k", ctrlKey: true, metaKey: false, altKey: false });
    typeOn(d, clock, "12", 5);
    clock.t += 5;
    d.keydown({ key: "Enter", ctrlKey: false, metaKey: false, altKey: false });
    expect(onScan).not.toHaveBeenCalled();
  });

  it("después de tipear lento, una ráfaga nueva sí es un código", () => {
    const clock = { t: 0 };
    const onScan = vi.fn();
    const d = createScanDetector({ onScan, now: () => clock.t });
    typeOn(d, clock, "pan", 150);
    clock.t += 500;
    typeOn(d, clock, "2000000010013", 6);
    clock.t += 6;
    d.keydown({ key: "Enter", ctrlKey: false, metaKey: false, altKey: false });
    expect(onScan).toHaveBeenCalledWith("2000000010013");
  });
});

const clock = { t: 1000 };

function Demo({ onScan }: { onScan: (c: string) => void }) {
  const [value, setValue] = useState("");
  useScanner({
    now: () => clock.t,
    onScan: (c) => {
      setValue((v) => stripScanLeak(v, c));
      onScan(c);
    },
  });
  return <input aria-label="Buscar" value={value} onChange={(e) => setValue(e.target.value)} />;
}

describe("useScanner en la pantalla", () => {
  it("escanea con el foco en el buscador y no deja el código tipeado", async () => {
    const onScan = vi.fn();
    render(<Demo onScan={onScan} />);
    const input = screen.getByLabelText("Buscar") as HTMLInputElement;
    input.focus();
    for (const key of "7791234000012") {
      clock.t += 7;
      const allowed = fireEvent.keyDown(input, { key });
      // Lo que no se canceló, el navegador lo escribiría en el campo.
      if (allowed) fireEvent.change(input, { target: { value: input.value + key } });
    }
    clock.t += 7;
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onScan).toHaveBeenCalledWith("7791234000012");
    expect(input.value).toBe("");
  });
});

describe("cámara y planilla de códigos", () => {
  it("el escaneo continuo no repite el mismo código enseguida", () => {
    let t = 0;
    const accept = createRepeatFilter(1500, () => t);
    expect(accept("7790000001017")).toBe(true);
    t = 300;
    expect(accept("7790000001017")).toBe(false);
    t = 600;
    expect(accept("7791234000012")).toBe(true);
    t = 5000;
    expect(accept("7791234000012")).toBe(true);
  });

  it("los códigos internos de la planilla empiezan con 2", () => {
    expect(pluFromInternalBarcode("2000000010013")).toBe("1001");
    expect(pluFromInternalBarcode("7791234000012")).toBeNull();
  });
});
