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
      env: { LOG_LEVEL: "warn" },
    },
    {
      command: `bun run --cwd apps/web vite --port ${E2E.webPort} --strictPort`,
      port: E2E.webPort,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { API_URL: `http://localhost:${E2E.apiPort}` },
    },
  ],
});
