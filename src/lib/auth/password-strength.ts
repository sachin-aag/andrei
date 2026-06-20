export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQUIRE_LETTER = true;
export const PASSWORD_REQUIRE_NUMBER = true;
export const PASSWORD_REQUIRE_SPECIAL = true;

export type PasswordStrengthValidation = {
  ok: boolean;
  errors: string[];
};

export function passwordStrengthRequirementText(): string {
  const requirements = [`at least ${PASSWORD_MIN_LENGTH} characters`];
  if (PASSWORD_REQUIRE_LETTER) requirements.push("one letter");
  if (PASSWORD_REQUIRE_NUMBER) requirements.push("one number");
  if (PASSWORD_REQUIRE_SPECIAL) requirements.push("one special character");
  return `Password must include ${requirements.join(", ")}.`;
}

export function validatePasswordStrength(password: string): PasswordStrengthValidation {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (PASSWORD_REQUIRE_LETTER && !/[A-Za-z]/.test(password)) {
    errors.push("Password must include at least one letter.");
  }
  if (PASSWORD_REQUIRE_NUMBER && !/[0-9]/.test(password)) {
    errors.push("Password must include at least one number.");
  }
  if (PASSWORD_REQUIRE_SPECIAL && !/[^A-Za-z0-9]/.test(password)) {
    errors.push("Password must include at least one special character.");
  }

  return { ok: errors.length === 0, errors };
}
