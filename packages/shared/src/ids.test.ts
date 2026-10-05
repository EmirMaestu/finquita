import { describe, expect, it } from "vitest";
import { isUuid, newId } from "./ids";

describe("newId", () => {
  it("genera UUIDv7 ordenables por tiempo", () => {
    const a = newId();
    const b = newId();
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe("7");
    expect(a < b).toBe(true);
  });
});
