import { describe, expect, it } from "vitest";
import { parseSse } from "../src/sync/events";

describe("parser de SSE", () => {
  it("separa eventos completos y guarda el resto", () => {
    const r = parseSse(
      'event: ready\ndata: \n\nevent: changes\ndata: {"entities":["products"]}\n\nevent: pi',
    );
    expect(r.events).toEqual([
      { event: "ready", data: "" },
      { event: "changes", data: '{"entities":["products"]}' },
    ]);
    expect(r.rest).toBe("event: pi");
  });
  it("ignora comentarios y junta líneas de data", () => {
    expect(parseSse(": hola\ndata: a\ndata: b\n\n").events).toEqual([
      { event: "message", data: "a\nb" },
    ]);
  });
});
