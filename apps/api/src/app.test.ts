import { describe, expect, it } from "vitest";
import { app } from "./app";

describe("api", () => {
  it("responde /api/health", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
  });
});
