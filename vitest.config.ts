import { defineConfig } from "vitest/config";
import "./scripts/load-env.ts";

export default defineConfig({
  test: {
    projects: ["packages/shared", "apps/api", "apps/web"],
  },
});
