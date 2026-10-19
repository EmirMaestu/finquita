/**
 * Manda un paso al driver de un usuario y muestra qué pasó.
 *   bun scripts/qa/step.ts qa/ronda-1/apurado pasos/03-abrir-caja.js [--page 1] [--see] [--text]
 * El archivo es JS con acceso a page, context, qa y expect (ver driver.ts). Después del paso
 * queda una captura en <dir>/pasos/NNN-<nombre>.png para mirar con Read.
 */
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const [dirArg, fileArg, ...rest] = process.argv.slice(2);
if (!dirArg || !fileArg) {
  console.error("Uso: bun scripts/qa/step.ts <dir del usuario> <archivo del paso> [--page N]");
  process.exit(2);
}
const dir = resolve(dirArg);
const info = JSON.parse(readFileSync(join(dir, ".driver.json"), "utf8")) as { port: number };
if (fileArg === "--quit") {
  await fetch(`http://127.0.0.1:${info.port}/quit`).catch(() => {});
  console.log("driver cerrado");
  process.exit(0);
}
const code = readFileSync(resolve(fileArg), "utf8");
const pi = rest.indexOf("--page");
const page = pi >= 0 ? Number(rest[pi + 1]) : 0;
const label = basename(fileArg).replace(/\.[jt]s$/, "");

let body = code;
if (rest.includes("--see")) body = `${code}\n;return await qa.see();`;
if (rest.includes("--text")) body = `${code}\n;return await qa.text();`;

const res = await fetch(`http://127.0.0.1:${info.port}/step`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ code: body, label, page }),
});
const out = (await res.json()) as {
  ok: boolean;
  error?: string;
  result?: unknown;
  url: string;
  ms: number;
  shot: string;
  events: { t: string; kind: string; text: string; url?: string; n: number }[];
};
console.log(`${out.ok ? "OK" : "ERROR"} · ${out.ms} ms · ${out.url}`);
if (out.error) console.log(`error: ${out.error}`);
if (out.result !== undefined && out.result !== null)
  console.log(
    `resultado: ${typeof out.result === "string" ? out.result : JSON.stringify(out.result, null, 1)}`,
  );
for (const e of out.events)
  console.log(`  [${e.t}] ${e.kind}${e.n > 1 ? ` ×${e.n}` : ""}: ${e.text}`);
console.log(`captura: ${out.shot}`);
