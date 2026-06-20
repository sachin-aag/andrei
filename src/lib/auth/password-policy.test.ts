import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    query: { passwordPolicySettings: { findFirst: vi.fn() } },
    insert: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  passwordPolicySettings: { id: "id" },
}));

import {
  DEFAULT_PASSWORD_POLICY,
  computePasswordExpiryState,
  validatePasswordPolicy,
} from "./password-policy";

describe("password policy", () => {
  it("requires the configured minimum length and complexity", () => {
    const weak = validatePasswordPolicy("abc");

    expect(weak.ok).toBe(false);
    expect(weak.errors).toEqual(
      expect.arrayContaining([
        "Password must be at least 8 characters.",
        "Password must include at least one number.",
        "Password must include at least one special character.",
      ])
    );

    expect(validatePasswordPolicy("abc12345!").ok).toBe(true);
  });

  it("marks a password as expired after the configured age", () => {
    const now = new Date("2026-06-20T00:00:00.000Z");
    const state = computePasswordExpiryState(
      {
        passwordHash: "hash",
        passwordChangedAt: new Date("2026-03-01T00:00:00.000Z"),
        passwordExpiryWarningDismissedUntil: null,
      },
      DEFAULT_PASSWORD_POLICY,
      now
    );

    expect(state.expired).toBe(true);
    expect(state.daysRemaining).toBe(0);
  });

  it("warns inside the warning window unless dismissed", () => {
    const now = new Date("2026-06-20T00:00:00.000Z");
    const passwordChangedAt = new Date("2026-04-01T00:00:00.000Z");

    const visible = computePasswordExpiryState(
      {
        passwordHash: "hash",
        passwordChangedAt,
        passwordExpiryWarningDismissedUntil: null,
      },
      DEFAULT_PASSWORD_POLICY,
      now
    );
    expect(visible.warning).toBe(true);
    expect(visible.daysRemaining).toBe(10);

    const dismissed = computePasswordExpiryState(
      {
        passwordHash: "hash",
        passwordChangedAt,
        passwordExpiryWarningDismissedUntil: new Date("2026-06-21T00:00:00.000Z"),
      },
      DEFAULT_PASSWORD_POLICY,
      now
    );
    expect(dismissed.warning).toBe(false);
    expect(dismissed.warningDismissed).toBe(true);
  });
});
