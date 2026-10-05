import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "api",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
