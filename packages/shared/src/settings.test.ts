import { describe, expect, it } from "vitest";
import { parseDenominations } from "./settings";

describe("parseDenominations", () => {
  it("toma montos enteros separados por coma, con o sin punto de miles, de mayor a menor", () => {
    expect(parseDenominations("2.000, 20000, 500")).toEqual([20000, 2000, 500]);
    expect(parseDenominations("20000 , 500")).toEqual([20000, 500]);
  });
  it("rechaza decimales, letras, negativos, ceros y repetidos (lo que pegó el destructor)", () => {
    expect(parseDenominations("abc, -5, 0, 1.000,50, 😈")).toBeNull();
    expect(parseDenominations("1000, 1000")).toBeNull();
    expect(parseDenominations("1,5, 20000")).toBeNull();
    expect(parseDenominations("")).toBeNull();
  });
});
