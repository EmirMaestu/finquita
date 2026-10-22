import { describe, expect, it } from "vitest";
import { cameraErrorText } from "../src/scan/CameraScanner";

const err = (name: string) => Object.assign(new Error(name), { name });

describe("la cámara que no abre dice por qué", () => {
  it("permiso, sin cámara, ocupada y lo demás tienen su mensaje (en la compu, sin 'teléfono')", () => {
    expect(cameraErrorText(err("NotAllowedError"))).toContain("candado de la barra");
    expect(cameraErrorText(err("NotFoundError"))).toContain("no tiene cámara");
    expect(cameraErrorText(err("NotReadableError"))).toContain("otra app");
    expect(cameraErrorText(err("Raro"))).toBe(
      "No pudimos abrir la cámara. Probá de nuevo o usá la pistola.",
    );
    expect(cameraErrorText(err("NotAllowedError"))).not.toContain("teléfono");
  });
});
