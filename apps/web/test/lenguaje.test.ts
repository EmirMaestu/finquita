// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Palabras que no van en la pantalla del mostrador (en inglés, técnicas o abreviadas). */
const PROHIBIDAS: [RegExp, string][] = [
  [/>\s*sent\s*</, "estado en inglés"],
  [/\$\{m\.reason\}/, "motivo crudo (breakage) en pantalla"],
  [/Confirm\.\s*</, "abreviatura Confirm."],
  [/\$\{[^}]*\}\s+u\b/, "unidad abreviada 'u'"],
  [/Compra en persona/, "nombre viejo del canal mayorista"],
  [/>\s*Al pedido\s*</, "nombre viejo de 'Sumar al pedido'"],
];
/** Si una pantalla habla de teclas, tiene que tener su variante para el celular. */
const PARES: [RegExp, RegExp, string][] = [
  [/Cualquier tecla/, /Tocá para/, "texto de teclado sin variante de celular"],
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("lenguaje de mostrador", () => {
  it("la UI no muestra palabras en inglés ni abreviaturas de la lista", () => {
    const roots = [
      fileURLToPath(new URL("../src", import.meta.url)),
      fileURLToPath(new URL("../../../packages/shared/src", import.meta.url)),
    ];
    const found: string[] = [];
    for (const root of roots)
      for (const f of files(root)) {
        if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
        const text = readFileSync(f, "utf8");
        for (const [re, why] of PROHIBIDAS) if (re.test(text)) found.push(`${f}: ${why}`);
        for (const [a, b, why] of PARES)
          if (a.test(text) && !b.test(text)) found.push(`${f}: ${why}`);
      }
    expect(found).toEqual([]);
  });
});
