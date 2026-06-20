import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    query: {
      workspaceUsers: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth/password-policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/password-policy")>();
  return {
    ...actual,
    getPasswordPolicy: vi.fn(),
  };
});

import { db } from "@/db";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { getCurrentUser } from "@/lib/auth/session";
import { POST } from "./route";

const admin = {
  id: "admin-1",
  name: "Admin",
  email: "admin@mjbiopharm.com",
  role: "admin" as const,
  title: "Admin",
};

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@mjbiopharm.com",
  role: "engineer" as const,
  title: "Engineer",
};

const policy = {
  minLength: 6,
  requireLetter: true,
  requireNumber: true,
  requireSpecial: true,
  expiryDays: 90,
  warningDays: 14,
  failedLoginAttemptLimit: 3,
  passwordHistoryLimit: 3,
};

function postRequest() {
  return new Request(
    "http://localhost/api/admin/users/user-1/reset-password-expiry",
    { method: "POST" }
  );
}

function mockUpdateReturning(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValueOnce(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValueOnce({ set } as never);
  return { set };
}

describe("POST /api/admin/users/[userId]/reset-password-expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPasswordPolicy).mockResolvedValue(policy);
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await POST(postRequest(), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("rejects non-admin requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);

    const response = await POST(postRequest(), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(403);
  });

  it("returns 404 when the target user is missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce(undefined);

    const response = await POST(postRequest(), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(404);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 400 when the user has no password", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce({
      id: "user-1",
      passwordHash: null,
      mustChangePassword: false,
    } as never);

    const response = await POST(postRequest(), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 400 when the user must change password", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce({
      id: "user-1",
      passwordHash: "hash",
      mustChangePassword: true,
    } as never);

    const response = await POST(postRequest(), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("resets password expiry for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce({
      id: "user-1",
      name: "User One",
      email: "user.one@mjbiopharm.com",
      role: "engineer",
      title: "Engineer",
      passwordHash: "hash",
      mustChangePassword: false,
      passwordChangedAt: new Date("2025-01-01T00:00:00.000Z"),
      passwordExpiryWarningDismissedUntil: new Date("2026-06-01T00:00:00.000Z"),
    } as never);

    const changedAt = new Date("2026-06-20T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(changedAt);

    const { set } = mockUpdateReturning([
      {
        id: "user-1",
        name: "User One",
        email: "user.one@mjbiopharm.com",
        role: "engineer",
        title: "Engineer",
        passwordHash: "hash",
        mustChangePassword: false,
        passwordChangedAt: changedAt,
        passwordExpiryWarningDismissedUntil: null,
      },
    ]);

    const response = await POST(postRequest(), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    vi.useRealTimers();

    expect(response.status).toBe(200);
    expect(set).toHaveBeenCalledWith({
      passwordChangedAt: changedAt,
      passwordExpiryWarningDismissedUntil: null,
    });
    await expect(response.json()).resolves.toMatchObject({
      user: {
        id: "user-1",
        passwordDaysRemaining: 90,
        passwordExpired: false,
      },
    });
  });
});
