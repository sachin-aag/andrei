import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    query: { passwordPolicySettings: { findFirst: vi.fn() } },
    insert: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  passwordPolicySettings: { id: "id" },
}));

import { db } from "@/db";
import {
  DEFAULT_PASSWORD_POLICY,
  PASSWORD_POLICY_CACHE_TTL_MS,
  clearPasswordPolicyCache,
  computePasswordExpiryState,
  getPasswordPolicy,
  validatePasswordPolicy,
} from "./password-policy";

describe("password policy", () => {
  it("defaults inactivity logout to 10 minutes", () => {
    expect(DEFAULT_PASSWORD_POLICY.inactivityTimeoutMinutes).toBe(10);
  });

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

describe("getPasswordPolicy cache", () => {
  beforeEach(() => {
    clearPasswordPolicyCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearPasswordPolicyCache();
    vi.useRealTimers();
  });

  it("reuses a successful lookup within the TTL", async () => {
    vi.mocked(db.query.passwordPolicySettings.findFirst).mockResolvedValue({
      id: "default",
      expiryDays: 90,
      inactivityTimeoutMinutes: 10,
      warningDays: 14,
      failedLoginAttemptLimit: 3,
      passwordHistoryLimit: 3,
    } as never);

    await getPasswordPolicy();
    await getPasswordPolicy();

    expect(db.query.passwordPolicySettings.findFirst).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed lookup", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(db.query.passwordPolicySettings.findFirst)
      .mockRejectedValueOnce(new Error("relation missing"))
      .mockResolvedValueOnce({
        id: "default",
        expiryDays: 45,
        inactivityTimeoutMinutes: 10,
        warningDays: 14,
        failedLoginAttemptLimit: 3,
        passwordHistoryLimit: 3,
      } as never);

    await expect(getPasswordPolicy()).resolves.toEqual(DEFAULT_PASSWORD_POLICY);
    const second = await getPasswordPolicy();
    expect(second.expiryDays).toBe(45);
    expect(db.query.passwordPolicySettings.findFirst).toHaveBeenCalledTimes(2);
  });

  it("looks up again after the TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T17:00:00.000Z"));
    vi.mocked(db.query.passwordPolicySettings.findFirst).mockResolvedValue({
      id: "default",
      expiryDays: 90,
      inactivityTimeoutMinutes: 10,
      warningDays: 14,
      failedLoginAttemptLimit: 3,
      passwordHistoryLimit: 3,
    } as never);

    await getPasswordPolicy();
    vi.setSystemTime(
      new Date("2026-09-10T17:00:00.000Z").getTime() +
        PASSWORD_POLICY_CACHE_TTL_MS
    );
    await getPasswordPolicy();

    expect(db.query.passwordPolicySettings.findFirst).toHaveBeenCalledTimes(2);
  });
});
