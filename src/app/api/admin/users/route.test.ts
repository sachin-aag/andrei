import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    query: {
      workspaceUsers: {
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(),
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
import { GET, POST } from "./route";

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
  return new Request("http://localhost/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockInsertReturning(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValueOnce(rows);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValueOnce({ values } as never);
  return { values };
}

describe("/api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hashPassword).mockResolvedValue("hashed.password");
  });

  it("rejects unauthenticated list requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("rejects non-admin list requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it("lists users for admins without password hashes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    vi.mocked(db.query.workspaceUsers.findMany).mockResolvedValueOnce([
      {
        id: "user-1",
        name: "User One",
        email: "user.one@mjbiopharm.com",
        role: "manager",
        title: "Manager",
        passwordHash: "hash",
        mustChangePassword: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ] as never);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      users: [
        {
          id: "user-1",
          name: "User One",
          email: "user.one@mjbiopharm.com",
          role: "manager",
          title: "Manager",
          hasPassword: true,
          mustChangePassword: true,
        },
      ],
    });
  });

  it("creates a user for admins with a temporary password", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    mockInsertReturning([
      {
        id: "user-1",
        name: "New User",
        email: "new.user@mjbiopharm.com",
        role: "admin",
        title: "Admin",
        passwordHash: "hashed.password",
        mustChangePassword: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const response = await POST(
      jsonRequest({
        name: "New User",
        email: "New.User@mjbiopharm.com",
        role: "admin",
        temporaryPassword: "TempPass123!",
      })
    );

    expect(response.status).toBe(201);
    expect(hashPassword).toHaveBeenCalledWith("TempPass123!");
    await expect(response.json()).resolves.toMatchObject({
      user: {
        email: "new.user@mjbiopharm.com",
        role: "admin",
        hasPassword: true,
        mustChangePassword: true,
      },
    });
  });

  it("returns 409 for duplicate user emails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    const duplicate = Object.assign(new Error("duplicate"), { code: "23505" });
    const returning = vi.fn().mockRejectedValueOnce(duplicate);
    const values = vi.fn().mockReturnValue({ returning });
    vi.mocked(db.insert).mockReturnValueOnce({ values } as never);

    const response = await POST(
      jsonRequest({
        email: "existing@mjbiopharm.com",
        role: "engineer",
        temporaryPassword: "TempPass123!",
      })
    );

    expect(response.status).toBe(409);
  });
});
