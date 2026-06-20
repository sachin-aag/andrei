import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    update: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn(),
}));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
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

function mockUpdateReturning(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValueOnce(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValueOnce({ set } as never);
  return { set };
}

describe("POST /api/admin/users/[userId]/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hashPassword).mockResolvedValue("new.hash");
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await POST(jsonRequest({ temporaryPassword: "TempPass123!" }), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("rejects non-admin requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);

    const response = await POST(jsonRequest({ temporaryPassword: "TempPass123!" }), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(403);
  });

  it("rejects short temporary passwords", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);

    const response = await POST(jsonRequest({ temporaryPassword: "short" }), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("sets a temporary password for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    const { set } = mockUpdateReturning([
      {
        id: "user-1",
        name: "User One",
        email: "user.one@mjbiopharm.com",
        role: "engineer",
        title: "Engineer",
        passwordHash: "new.hash",
        mustChangePassword: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const response = await POST(jsonRequest({ temporaryPassword: "TempPass123!" }), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(200);
    expect(hashPassword).toHaveBeenCalledWith("TempPass123!");
    expect(set).toHaveBeenCalledWith({
      passwordHash: "new.hash",
      mustChangePassword: true,
    });
    await expect(response.json()).resolves.toEqual({
      user: {
        id: "user-1",
        mustChangePassword: true,
        hasPassword: true,
      },
    });
  });
});
