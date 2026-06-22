import { eq } from "drizzle-orm";
import { db } from "@/db";
import { passwordPolicySettings } from "@/db/schema";
import { DEFAULT_INACTIVITY_TIMEOUT_MINUTES } from "@/lib/auth/inactivity-timeout";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIRE_LETTER,
  PASSWORD_REQUIRE_NUMBER,
  PASSWORD_REQUIRE_SPECIAL,
  passwordStrengthRequirementText,
  validatePasswordStrength,
  type PasswordStrengthValidation,
} from "@/lib/auth/password-strength";

export const PASSWORD_POLICY_SETTINGS_ID = "default";
export const PASSWORD_EXPIRY_WARNING_SNOOZE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type OperationalPasswordPolicy = {
  expiryDays: number;
  inactivityTimeoutMinutes: number;
  warningDays: number;
  failedLoginAttemptLimit: number;
  passwordHistoryLimit: number;
};

/** Full policy: code-defined strength rules plus DB-backed operational settings. */
export type PasswordPolicy = OperationalPasswordPolicy & {
  minLength: number;
  requireLetter: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
};

export type PasswordPolicyValidation = PasswordStrengthValidation;

export type PasswordExpiryState = {
  expiresAt: Date | null;
  daysRemaining: number | null;
  expired: boolean;
  warning: boolean;
  warningDismissed: boolean;
};

type PasswordExpiryInput = {
  passwordHash: string | null;
  passwordChangedAt: Date | null;
  passwordExpiryWarningDismissedUntil?: Date | null;
};

const CODE_DEFINED_STRENGTH = {
  minLength: PASSWORD_MIN_LENGTH,
  requireLetter: PASSWORD_REQUIRE_LETTER,
  requireNumber: PASSWORD_REQUIRE_NUMBER,
  requireSpecial: PASSWORD_REQUIRE_SPECIAL,
} as const;

export const DEFAULT_OPERATIONAL_PASSWORD_POLICY: OperationalPasswordPolicy = {
  expiryDays: 90,
  inactivityTimeoutMinutes: DEFAULT_INACTIVITY_TIMEOUT_MINUTES,
  warningDays: 14,
  failedLoginAttemptLimit: 3,
  passwordHistoryLimit: 3,
};

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  ...CODE_DEFINED_STRENGTH,
  ...DEFAULT_OPERATIONAL_PASSWORD_POLICY,
};

function normalizeOperationalPolicy(
  row: Partial<OperationalPasswordPolicy> | null | undefined
): OperationalPasswordPolicy {
  return {
    ...DEFAULT_OPERATIONAL_PASSWORD_POLICY,
    ...Object.fromEntries(
      Object.entries(row ?? {}).filter(
        ([, value]) => value !== null && value !== undefined
      )
    ),
  };
}

function mergePasswordPolicy(
  operational: OperationalPasswordPolicy
): PasswordPolicy {
  return {
    ...CODE_DEFINED_STRENGTH,
    ...operational,
  };
}

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  const existing = await db.query.passwordPolicySettings.findFirst({
    where: eq(passwordPolicySettings.id, PASSWORD_POLICY_SETTINGS_ID),
  });
  if (existing) {
    return mergePasswordPolicy(normalizeOperationalPolicy(existing));
  }

  await db.insert(passwordPolicySettings).values({
    id: PASSWORD_POLICY_SETTINGS_ID,
    ...DEFAULT_OPERATIONAL_PASSWORD_POLICY,
  });
  return DEFAULT_PASSWORD_POLICY;
}

export async function updatePasswordExpiryDays(
  expiryDays: number
): Promise<number> {
  const updated = await updatePasswordPolicySettings({ expiryDays });
  return updated.expiryDays;
}

export async function updatePasswordPolicySettings(
  updates: Partial<
    Pick<PasswordPolicy, "expiryDays" | "inactivityTimeoutMinutes">
  >
): Promise<PasswordPolicy> {
  await getPasswordPolicy();

  const [updated] = await db
    .update(passwordPolicySettings)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(passwordPolicySettings.id, PASSWORD_POLICY_SETTINGS_ID))
    .returning();

  if (!updated) {
    throw new Error("password_policy_settings row missing after ensure");
  }

  return mergePasswordPolicy(normalizeOperationalPolicy(updated));
}

export function passwordPolicyRequirementText(): string {
  return passwordStrengthRequirementText();
}

export function validatePasswordPolicy(
  password: string
): PasswordPolicyValidation {
  return validatePasswordStrength(password);
}

export function computePasswordExpiryState(
  user: PasswordExpiryInput,
  policy: PasswordPolicy,
  now = new Date()
): PasswordExpiryState {
  if (!user.passwordHash || !user.passwordChangedAt || policy.expiryDays <= 0) {
    return {
      expiresAt: null,
      daysRemaining: null,
      expired: false,
      warning: false,
      warningDismissed: false,
    };
  }

  const expiresAt = new Date(
    user.passwordChangedAt.getTime() + policy.expiryDays * DAY_MS
  );
  const msRemaining = expiresAt.getTime() - now.getTime();
  const expired = msRemaining <= 0;
  const daysRemaining = expired ? 0 : Math.ceil(msRemaining / DAY_MS);
  const warningDismissed =
    !!user.passwordExpiryWarningDismissedUntil &&
    user.passwordExpiryWarningDismissedUntil.getTime() > now.getTime();
  const warning =
    !expired &&
    daysRemaining <= policy.warningDays &&
    !warningDismissed;

  return {
    expiresAt,
    daysRemaining,
    expired,
    warning,
    warningDismissed,
  };
}

export function nextPasswordWarningDismissal(
  expiresAt: Date | null,
  now = new Date()
): Date {
  const snoozeUntil = new Date(
    now.getTime() + PASSWORD_EXPIRY_WARNING_SNOOZE_DAYS * DAY_MS
  );
  if (!expiresAt || snoozeUntil < expiresAt) return snoozeUntil;
  return expiresAt;
}
