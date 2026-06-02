import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("temporary password reuse check", () => {
  it("detects when new password matches stored hash", async () => {
    const temporary = "TempPass123!";
    const stored = await hashPassword(temporary);
    expect(await verifyPassword(temporary, stored)).toBe(true);
    expect(await verifyPassword("DifferentPass99!", stored)).toBe(false);
  });
});
