import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JWT_WORKSPACE_STATE_TTL_MS,
  shouldRefreshJwtWorkspaceState,
  stampJwtWorkspaceStateCheckedAt,
} from "./jwt-workspace-state";

describe("shouldRefreshJwtWorkspaceState", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes on sign-in even with a fresh stamp", () => {
    expect(
      shouldRefreshJwtWorkspaceState(
        {
          workspaceUserId: "ws-1",
          mustChangePassword: false,
          passwordExpired: false,
          jwtStateCheckedAt: Date.now(),
        },
        { hasUser: true }
      )
    ).toBe(true);
  });

  it("refreshes on session update", () => {
    expect(
      shouldRefreshJwtWorkspaceState(
        {
          workspaceUserId: "ws-1",
          jwtStateCheckedAt: Date.now(),
        },
        { hasUser: false, trigger: "update" }
      )
    ).toBe(true);
  });

  it("refreshes while the token still requires a password change", () => {
    expect(
      shouldRefreshJwtWorkspaceState(
        {
          workspaceUserId: "ws-1",
          mustChangePassword: true,
          jwtStateCheckedAt: Date.now(),
        },
        { hasUser: false }
      )
    ).toBe(true);
  });

  it("refreshes while the token is still expired", () => {
    expect(
      shouldRefreshJwtWorkspaceState(
        {
          workspaceUserId: "ws-1",
          passwordExpired: true,
          jwtStateCheckedAt: Date.now(),
        },
        { hasUser: false }
      )
    ).toBe(true);
  });

  it("skips a fresh stamped token", () => {
    expect(
      shouldRefreshJwtWorkspaceState(
        {
          workspaceUserId: "ws-1",
          mustChangePassword: false,
          passwordExpired: false,
          jwtStateCheckedAt: Date.now(),
        },
        { hasUser: false }
      )
    ).toBe(false);
  });

  it("refreshes after the TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T17:00:00.000Z"));
    const token = {
      workspaceUserId: "ws-1",
      jwtStateCheckedAt: Date.now(),
    };
    vi.setSystemTime(
      new Date("2026-09-10T17:00:00.000Z").getTime() +
        JWT_WORKSPACE_STATE_TTL_MS
    );
    expect(
      shouldRefreshJwtWorkspaceState(token, { hasUser: false })
    ).toBe(true);
  });

  it("refreshes when the stamp is missing", () => {
    expect(
      shouldRefreshJwtWorkspaceState(
        { workspaceUserId: "ws-1" },
        { hasUser: false }
      )
    ).toBe(true);
  });

  it("does not refresh an empty anonymous token", () => {
    expect(
      shouldRefreshJwtWorkspaceState({}, { hasUser: false })
    ).toBe(false);
  });
});

describe("stampJwtWorkspaceStateCheckedAt", () => {
  it("writes the check timestamp", () => {
    const token: { jwtStateCheckedAt?: number } = {};
    stampJwtWorkspaceStateCheckedAt(token, 1_000);
    expect(token.jwtStateCheckedAt).toBe(1_000);
  });
});
