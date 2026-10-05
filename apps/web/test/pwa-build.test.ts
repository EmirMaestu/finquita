// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = mkdtempSync(join(tmpdir(), "mostrador-build-"));

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe("build de la PWA", () => {
  it("genera el manifest y el service worker que precachea la app", async () => {
    await build({ root, logLevel: "silent", build: { outDir, emptyOutDir: true } });
    const manifest = JSON.parse(readFileSync(join(outDir, "manifest.webmanifest"), "utf8"));
    expect(manifest.name).toBe("Mostrador");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    expect(existsSync(join(outDir, "sw.js"))).toBe(true);
    const sw = readFileSync(join(outDir, "sw.js"), "utf8");
    expect(sw).toContain("index.html");
    expect(readFileSync(join(outDir, "index.html"), "utf8")).toContain("manifest.webmanifest");
  }, 60_000);
});
