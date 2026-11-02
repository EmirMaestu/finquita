import { describe, expect, it } from "vitest";
import { guessDevice } from "../src/lib/device";

describe("habilitar este dispositivo propone el equipo desde el que se abre", () => {
  it("iPhone, Mac y lo demás", () => {
    expect(guessDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toEqual({
      name: "iPhone",
      kind: "iphone",
    });
    expect(guessDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toEqual({
      name: "Mac del mostrador",
      kind: "mac",
    });
    expect(guessDevice("Mozilla/5.0 (X11; Linux x86_64)").kind).toBe("other");
  });
});
