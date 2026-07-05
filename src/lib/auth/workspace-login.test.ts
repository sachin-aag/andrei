import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    query: {
      workspaceUsers: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}));

import { db } from "@/db";
import {
  clearFailedLoginAttempts,
  findWorkspaceUserForLogin,
  isWorkspaceUserLocked,
  recordFailedLoginAttempt,
} from "@/lib/auth/workspace-login";

describe("workspace-login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads full security state when columns exist", async () => {
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce({
      id: "user-1",
      name: "Test User",
      passwordHash: "hash",
      failedLoginAttempts: 2,
      lockedAt: null,
      deactivatedAt: null,
    } as never);

    await expect(
      findWorkspaceUserForLogin("user@mjbiopharm.com")
    ).resolves.toMatchObject({
      id: "user-1",
      failedLoginAttempts: 2,
      lockedAt: null,
    });
  });

  it("falls back to core columns when security columns are missing", async () => {
    vi.mocked(db.query.workspaceUsers.findFirst)
      .mockRejectedValueOnce(new Error("column failed_login_attempts does not exist"))
      .mockResolvedValueOnce({
        id: "user-1",
        name: "Test User",
        passwordHash: "hash",
      } as never);

    await expect(
      findWorkspaceUserForLogin("user@mjbiopharm.com")
    ).resolves.toMatchObject({
      id: "user-1",
      failedLoginAttempts: 0,
      lockedAt: null,
      deactivatedAt: null,
    });
  });

  it("swallows lockout update failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const where = vi.fn().mockRejectedValue(
      new Error("column failed_login_attempts does not exist")
    );
    const set = vi.fn(() => ({ where }));
    vi.mocked(db.update).mockReturnValueOnce({ set } as never);

    await expect(
      recordFailedLoginAttempt("user-1", 3, true)
    ).resolves.toBeUndefined();
  });

  it("swallows lockout clear failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const where = vi.fn().mockRejectedValue(
      new Error("column locked_at does not exist")
    );
    const set = vi.fn(() => ({ where }));
    vi.mocked(db.update).mockReturnValueOnce({ set } as never);

    await expect(clearFailedLoginAttempts("user-1")).resolves.toBeUndefined();
  });

  it("treats missing locked_at as unlocked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(db.query.workspaceUsers.findFirst).mockRejectedValueOnce(
      new Error("column locked_at does not exist")
    );

    await expect(isWorkspaceUserLocked("user@mjbiopharm.com")).resolves.toBe(
      false
    );
  });
});
