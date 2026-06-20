import { describe, expect, it } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  passwordStrengthRequirementText,
  validatePasswordStrength,
} from "./password-strength";

describe("password strength", () => {
  it("requires minimum length and complexity", () => {
    const weak = validatePasswordStrength("abc");

    expect(weak.ok).toBe(false);
    expect(weak.errors).toEqual(
      expect.arrayContaining([
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
        "Password must include at least one number.",
        "Password must include at least one special character.",
      ])
    );

    expect(validatePasswordStrength("abc12345!").ok).toBe(true);
  });

  it("describes requirements in helper text", () => {
    expect(passwordStrengthRequirementText()).toContain(
      `at least ${PASSWORD_MIN_LENGTH} characters`
    );
    expect(passwordStrengthRequirementText()).toContain("one special character");
  });
});
