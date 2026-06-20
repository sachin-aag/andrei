import { describe, expect, it } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  getPasswordStrengthChecks,
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

  it("returns per-rule checklist state", () => {
    const checks = getPasswordStrengthChecks("abc");

    expect(checks.find((check) => check.id === "length")?.met).toBe(false);
    expect(checks.find((check) => check.id === "number")?.met).toBe(false);
    expect(checks.find((check) => check.id === "special")?.met).toBe(false);
    expect(checks.find((check) => check.id === "letter")?.met).toBe(true);

    expect(getPasswordStrengthChecks("abc12345!").every((check) => check.met)).toBe(
      true
    );
  });
});
