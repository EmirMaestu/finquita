import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./e2e/env";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: E2E.webUrl,
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mac", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      command: "bun apps/api/scripts/e2e-api.ts",
      port: E2E.apiPort,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { LOG_LEVEL: "warn", OFF_DISABLED: "1" },
    },
    {
      // Build real + preview: igual que en producción (sin recargas del servidor de desarrollo).
      command: `bun run --cwd apps/web vite build --logLevel warn && bun run --cwd apps/web vite preview --port ${E2E.webPort} --strictPort`,
      port: E2E.webPort,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { API_URL: `http://localhost:${E2E.apiPort}` },
    },
    {
      // Instalación nueva para el primer uso: su propia API y base vacía.
      command: "bun apps/api/scripts/e2e-api.ts",
      port: E2E.empty.apiPort,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { LOG_LEVEL: "warn", OFF_DISABLED: "1", E2E_EMPTY: "1" },
    },
    {
      // Usa el mismo build: espera a que esté y lo sirve apuntando a la API vacía.
      command: `sh -c 'until [ -f apps/web/dist/index.html ] && [ -f apps/web/dist/sw.js ]; do sleep 1; done; sleep 2; bun run --cwd apps/web vite preview --port ${E2E.empty.webPort} --strictPort'`,
      port: E2E.empty.webPort,
      reuseExistingServer: false,
      timeout: 240_000,
      env: { API_URL: `http://localhost:${E2E.empty.apiPort}` },
    },
  ],
});
