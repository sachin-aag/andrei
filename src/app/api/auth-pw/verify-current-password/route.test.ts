import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: { workspaceUsers: { findFirst: vi.fn() } },
  },
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/db";
import { verifyPassword } from "@/lib/auth/password";
import { POST } from "./route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth-pw/verify-current-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth-pw/verify-current-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-1",
      name: "User",
      email: "user@mjbiopharm.com",
      role: "engineer",
      title: "Engineer",
    });
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValue({
      passwordHash: "hash",
    } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(jsonRequest({ currentPassword: "old-pass" }));

    expect(res.status).toBe(401);
  });

  it("returns 400 when current password is wrong", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);

    const res = await POST(jsonRequest({ currentPassword: "wrong-pass" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Current password is incorrect.");
  });

  it("returns ok when current password matches", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);

    const res = await POST(jsonRequest({ currentPassword: "correct-pass" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(verifyPassword).toHaveBeenCalledWith("correct-pass", "hash");
  });
});
