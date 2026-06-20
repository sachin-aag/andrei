import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: { workspaceUsers: { findFirst: vi.fn() } },
  },
}));

vi.mock("@/lib/auth/password-history", () => ({
  isPasswordRecentlyUsed: vi.fn(),
}));

vi.mock("@/lib/auth/password-policy", () => ({
  getPasswordPolicy: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { isPasswordRecentlyUsed } from "@/lib/auth/password-history";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { POST } from "./route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth-pw/check-password-reuse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth-pw/check-password-reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      user: { workspaceUserId: "user-1" },
    } as never);
    vi.mocked(getPasswordPolicy).mockResolvedValue({
      passwordHistoryLimit: 3,
    } as never);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValue({
      passwordHash: "current.hash",
      passwordHistory: ["current.hash", "old.hash"],
    } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await POST(jsonRequest({ password: "new-pass" }));

    expect(res.status).toBe(401);
  });

  it("returns recentlyUsed from password history check", async () => {
    vi.mocked(isPasswordRecentlyUsed).mockResolvedValue(true);

    const res = await POST(jsonRequest({ password: "old-pass" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ recentlyUsed: true });
    expect(isPasswordRecentlyUsed).toHaveBeenCalledWith({
      password: "old-pass",
      currentPasswordHash: "current.hash",
      passwordHistory: ["current.hash", "old.hash"],
      historyLimit: 3,
    });
  });
});
