import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/db", () => ({
  db: {
    query: {
      workspaceUsers: {
        findFirst: vi.fn(),
      },
    },
  },
}));

import { db } from "@/db";
import { POST } from "./route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth/check-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("POST /api/auth/check-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns allowed false when email is missing", async () => {
    const res = await POST(jsonRequest({}));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ allowed: false });
    expect(db.query.workspaceUsers.findFirst).not.toHaveBeenCalled();
  });

  it("reports password and lock state for registered users", async () => {
    vi.mocked(db.query.workspaceUsers.findFirst)
      .mockResolvedValueOnce({
        id: "user-1",
        passwordHash: "hash",
      } as never)
      .mockResolvedValueOnce({
        lockedAt: new Date("2026-01-01"),
      } as never);

    const res = await POST(jsonRequest({ email: "User@MJBiopharm.com " }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      allowed: true,
      hasPassword: true,
      locked: true,
    });
  });

  it("returns allowed false for unknown users", async () => {
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce(undefined);

    const res = await POST(jsonRequest({ email: "nobody@mjbiopharm.com" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      allowed: false,
      hasPassword: false,
      locked: false,
    });
  });

  it("returns JSON when the database query fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(db.query.workspaceUsers.findFirst).mockRejectedValueOnce(
      new Error("connection refused")
    );

    const res = await POST(jsonRequest({ email: "user@mjbiopharm.com" }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("Could not check"),
    });
  });
});
