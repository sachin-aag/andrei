import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    query: {
      workspaceUsers: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth/password-reset", () => ({
  sendPasswordResetLink: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  auditActorFromUser: vi.fn((user: { id: string; name: string; role: string }) => ({
    id: user.id,
    name: user.name,
    role: user.role,
  })),
  recordAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
}));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { sendPasswordResetLink } from "@/lib/auth/password-reset";
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

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/admin/users/user-1/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/users/[userId]/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendPasswordResetLink).mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await POST(jsonRequest({}), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("rejects non-admin requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);

    const response = await POST(jsonRequest({}), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(403);
  });

  it("returns 404 when the target user is missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce(undefined);

    const response = await POST(jsonRequest({}), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(404);
    expect(sendPasswordResetLink).not.toHaveBeenCalled();
  });

  it("sends a password reset email for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce({
      id: "user-1",
      name: "User One",
      email: "user.one@mjbiopharm.com",
      role: "engineer",
      title: "Engineer",
      passwordHash: "old.hash",
      mustChangePassword: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);

    const response = await POST(jsonRequest({}), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(200);
    expect(sendPasswordResetLink).toHaveBeenCalledWith("user.one@mjbiopharm.com");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      email: "user.one@mjbiopharm.com",
    });
  });

  it("returns 500 when email delivery fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce({
      id: "user-1",
      name: "User One",
      email: "user.one@mjbiopharm.com",
      role: "engineer",
      title: "Engineer",
      passwordHash: "old.hash",
      mustChangePassword: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);
    vi.mocked(sendPasswordResetLink).mockRejectedValueOnce(
      new Error("email failed")
    );

    const response = await POST(jsonRequest({}), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(500);
  });
});
