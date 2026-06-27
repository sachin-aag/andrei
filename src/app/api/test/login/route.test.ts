import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/test/login/route";

vi.mock("@/db", () => ({
  db: {
    query: {
      workspaceUsers: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("next-auth/jwt", () => ({
  encode: vi.fn().mockResolvedValue("test-jwt"),
}));

import { db } from "@/db";
import { encode } from "next-auth/jwt";

const passwordSchemaDefaults = {
  passwordHistory: [] as string[],
  passwordResetTokenHash: null,
  passwordResetTokenExpiresAt: null,
  deactivatedAt: null,
};

const engineerUser = {
  id: "user-1",
  name: "Test Engineer",
  email: "test.engineer@mjbiopharm.com",
  role: "engineer" as const,
  title: "Test Engineer",
  mustChangePassword: false,
  passwordHash: null,
  passwordChangedAt: null,
  failedLoginAttempts: 0,
  lockedAt: null,
  passwordExpiryWarningDismissedUntil: null,
  createdAt: new Date("2026-01-01"),
  ...passwordSchemaDefaults,
};

const managerUser = {
  id: "user-2",
  name: "Test Manager",
  email: "test.manager@mjbiopharm.com",
  role: "manager" as const,
  title: "Manager",
  mustChangePassword: false,
  passwordHash: null,
  passwordChangedAt: null,
  failedLoginAttempts: 0,
  lockedAt: null,
  passwordExpiryWarningDismissedUntil: null,
  createdAt: new Date("2026-01-01"),
  ...passwordSchemaDefaults,
};

const adminUser = {
  id: "user-3",
  name: "Test Admin",
  email: "test.admin@mjbiopharm.com",
  role: "admin" as const,
  title: "Admin",
  mustChangePassword: false,
  passwordHash: null,
  passwordChangedAt: null,
  failedLoginAttempts: 0,
  lockedAt: null,
  passwordExpiryWarningDismissedUntil: null,
  createdAt: new Date("2026-01-01"),
  ...passwordSchemaDefaults,
};

describe("POST /api/test/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ALLOW_TEST_LOGIN", "true");
    vi.stubEnv("TEST_AUTH_EMAIL", "test.engineer@mjbiopharm.com");
    vi.stubEnv("AUTH_SECRET", "test-secret");
  });

  it("returns 404 when test login is disabled", async () => {
    vi.stubEnv("ALLOW_TEST_LOGIN", "false");
    const res = await POST(new Request("http://localhost/api/test/login"));
    expect(res.status).toBe(404);
  });

  it("mints session for default engineer", async () => {
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValue(engineerUser);

    const res = await POST(new Request("http://localhost/api/test/login"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      userId: engineerUser.id,
      email: engineerUser.email,
      role: "engineer",
    });
    expect(encode).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.objectContaining({
          workspaceUserId: engineerUser.id,
          mustChangePassword: false,
        }),
      })
    );
  });

  it("accepts manager role in body", async () => {
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValue(managerUser);

    const res = await POST(
      new Request("http://localhost/api/test/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test.manager@mjbiopharm.com",
          role: "manager",
        }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("manager");
  });

  it("accepts admin role in body", async () => {
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValue(adminUser);

    const res = await POST(
      new Request("http://localhost/api/test/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test.admin@mjbiopharm.com",
          role: "admin",
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("admin");
  });

  it("includes mustChangePassword in JWT when requested", async () => {
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValue({
      ...engineerUser,
      mustChangePassword: true,
    });

    await POST(
      new Request("http://localhost/api/test/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mustChangePassword: true }),
      })
    );

    expect(encode).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.objectContaining({ mustChangePassword: true }),
      })
    );
  });
});
