import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "api",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // De a un archivo: el pull solo entrega lo anterior al xmin, que es de todo el servidor. Una
    // transacción de otro archivo en paralelo, aunque sea en otra base, frena lo que este espera ver.
    maxWorkers: 1,
    globalSetup: ["./test/global-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
