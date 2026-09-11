import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      workspaceUsers: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/auth/workspace-users", () => ({
  getWorkspaceUserById: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { getWorkspaceUserById } from "@/lib/auth/workspace-users";
import { getCurrentUser } from "./session";

const activeRow = {
  id: "ws-1",
  name: "Engineer",
  email: "engineer@mjbiopharm.com",
  role: "engineer" as const,
  title: "Engineer",
  deactivatedAt: null,
  sessionVersion: 2,
};

describe("getCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null without a workspace user on the session", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: {} } as never);
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(db.query.workspaceUsers.findFirst).not.toHaveBeenCalled();
  });

  it("returns null when the workspace user is deactivated", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { workspaceUserId: "ws-1", sessionVersion: 2 },
    } as never);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce({
      ...activeRow,
      deactivatedAt: new Date("2026-09-11T00:00:00.000Z"),
    } as never);

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(getWorkspaceUserById).not.toHaveBeenCalled();
  });

  it("returns null when the JWT session version is stale", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { workspaceUserId: "ws-1", sessionVersion: 1 },
    } as never);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce(
      activeRow as never
    );

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("returns the user when active and the session version matches", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { workspaceUserId: "ws-1", sessionVersion: 2 },
    } as never);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce(
      activeRow as never
    );

    await expect(getCurrentUser()).resolves.toEqual({
      id: "ws-1",
      name: "Engineer",
      email: "engineer@mjbiopharm.com",
      role: "engineer",
      title: "Engineer",
    });
  });

  it("treats a missing JWT sessionVersion as 0", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { workspaceUserId: "ws-1" },
    } as never);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce({
      ...activeRow,
      sessionVersion: 0,
    } as never);

    await expect(getCurrentUser()).resolves.toMatchObject({ id: "ws-1" });
  });
});
