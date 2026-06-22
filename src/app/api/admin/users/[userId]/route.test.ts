import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
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
import { DELETE, PATCH } from "./route";

const admin = {
  id: "admin-1",
  name: "Admin",
  email: "admin@mjbiopharm.com",
  role: "admin" as const,
  title: "Admin",
};

const manager = {
  id: "manager-1",
  name: "Manager",
  email: "manager@mjbiopharm.com",
  role: "manager" as const,
  title: "Manager",
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/admin/users/user-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest() {
  return new Request("http://localhost/api/admin/users/user-1", {
    method: "DELETE",
  });
}

function mockUpdateReturning(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValueOnce(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValueOnce({ set } as never);
  return { set };
}

function mockSelectExistingUser() {
  const where = vi.fn().mockResolvedValueOnce([
    {
      id: "user-1",
      name: "User One",
      email: "user.one@mjbiopharm.com",
      role: "engineer",
      title: "Engineer",
    },
  ]);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function mockDeleteReturning(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValueOnce(rows);
  const where = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.delete).mockReturnValueOnce({ where } as never);
  return { where };
}

function mockDeleteWhere() {
  const where = vi.fn().mockResolvedValueOnce(undefined);
  vi.mocked(db.delete).mockReturnValueOnce({ where } as never);
  return { where };
}

describe("PATCH /api/admin/users/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await PATCH(jsonRequest({ role: "manager" }), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("rejects non-admin requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(manager);

    const response = await PATCH(jsonRequest({ role: "manager" }), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(403);
  });

  it("prevents admins from removing their own admin role", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);

    const response = await PATCH(jsonRequest({ role: "engineer" }), {
      params: Promise.resolve({ userId: "admin-1" }),
    });

    expect(response.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates a user role for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    mockSelectExistingUser();
    const { set } = mockUpdateReturning([
      {
        id: "user-1",
        name: "User One",
        email: "user.one@mjbiopharm.com",
        role: "manager",
        title: "Manager",
        passwordHash: null,
        mustChangePassword: false,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const response = await PATCH(jsonRequest({ role: "manager" }), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(200);
    expect(set).toHaveBeenCalledWith({ role: "manager", title: "Manager" });
    await expect(response.json()).resolves.toMatchObject({
      user: {
        id: "user-1",
        role: "manager",
        hasPassword: false,
      },
    });
  });
});

describe("DELETE /api/admin/users/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(401);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("rejects non-admin requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(manager);

    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("prevents admins from deleting their own account", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);

    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ userId: "admin-1" }),
    });

    expect(response.status).toBe(400);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when the target user is missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    mockDeleteReturning([]);

    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(404);
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it("deletes a workspace user and matching auth user for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    mockDeleteReturning([
      {
        id: "user-1",
        name: "User One",
        email: "user.one@mjbiopharm.com",
        role: "engineer",
        title: "Engineer",
        passwordHash: "old.hash",
        mustChangePassword: false,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    mockDeleteWhere();

    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(response.status).toBe(200);
    expect(db.delete).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
