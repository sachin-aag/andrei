import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: { workspaceUsers: { findFirst: vi.fn() } },
    update: vi.fn(),
  },
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn(),
}));

vi.mock("@/lib/auth/password-history", () => ({
  isPasswordRecentlyUsed: vi.fn(),
  recordPasswordHistory: vi.fn(),
}));

vi.mock("@/lib/auth/password-policy", () => ({
  computePasswordExpiryState: vi.fn(),
  getPasswordPolicy: vi.fn(),
  validatePasswordPolicy: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { hashPassword } from "@/lib/auth/password";
import {
  isPasswordRecentlyUsed,
  recordPasswordHistory,
} from "@/lib/auth/password-history";
import {
  computePasswordExpiryState,
  getPasswordPolicy,
  validatePasswordPolicy,
} from "@/lib/auth/password-policy";
import { POST } from "./route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth-pw/replace-shared-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth-pw/replace-shared-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hashPassword).mockResolvedValue("new.hash");
    vi.mocked(getPasswordPolicy).mockResolvedValue({
      minLength: 6,
      requireLetter: true,
      requireNumber: true,
      requireSpecial: true,
      expiryDays: 90,
      inactivityTimeoutMinutes: 10,
      warningDays: 14,
      failedLoginAttemptLimit: 3,
      passwordHistoryLimit: 3,
    });
    vi.mocked(validatePasswordPolicy).mockReturnValue({ ok: true, errors: [] });
    vi.mocked(computePasswordExpiryState).mockReturnValue({
      expiresAt: null,
      daysRemaining: null,
      expired: false,
      warning: false,
      warningDismissed: false,
    });
    vi.mocked(isPasswordRecentlyUsed).mockResolvedValue(false);
    vi.mocked(recordPasswordHistory).mockResolvedValue(undefined);
    const set = vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    vi.mocked(db.update).mockReturnValue({ set } as never);
  });

  it("returns 401 without session", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const res = await POST(jsonRequest({ password: "a", confirmPassword: "a" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when mustChangePassword is false", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { workspaceUserId: "ws-1" },
    } as never);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce({
      id: "ws-1",
      passwordHash: "old.hash",
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      passwordExpiryWarningDismissedUntil: null,
    } as never);

    const res = await POST(
      jsonRequest({ password: "NewPass123!", confirmPassword: "NewPass123!" })
    );
    expect(res.status).toBe(403);
  });

  it("rejects reusing a recent password", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { workspaceUserId: "ws-1" },
    } as never);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce({
      id: "ws-1",
      passwordHash: "temp.hash",
      mustChangePassword: true,
      passwordChangedAt: new Date(),
      passwordExpiryWarningDismissedUntil: null,
    } as never);
    vi.mocked(isPasswordRecentlyUsed).mockResolvedValueOnce(true);

    const res = await POST(
      jsonRequest({ password: "TempPass123!", confirmPassword: "TempPass123!" })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("recently"),
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates hash and clears mustChangePassword", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { workspaceUserId: "ws-1" },
    } as never);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce({
      id: "ws-1",
      passwordHash: "temp.hash",
      mustChangePassword: true,
      passwordChangedAt: new Date(),
      passwordExpiryWarningDismissedUntil: null,
    } as never);

    const res = await POST(
      jsonRequest({ password: "MyOwnPass99!", confirmPassword: "MyOwnPass99!" })
    );
    expect(res.status).toBe(200);
    expect(hashPassword).toHaveBeenCalledWith("MyOwnPass99!");
    expect(db.update).toHaveBeenCalled();
    const set = vi.mocked(db.update).mock.results[0]?.value.set as ReturnType<
      typeof vi.fn
    >;
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash: "new.hash",
        mustChangePassword: false,
        failedLoginAttempts: 0,
        lockedAt: null,
        passwordExpiryWarningDismissedUntil: null,
      })
    );
    expect(recordPasswordHistory).toHaveBeenCalledWith({
      userId: "ws-1",
      previousPasswordHash: "temp.hash",
      historyLimit: 3,
    });
  });
});
