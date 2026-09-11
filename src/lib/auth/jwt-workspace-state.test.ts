import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JWT_WORKSPACE_STATE_TTL_MS,
  bindJwtWorkspaceIdentity,
  clearJwtWorkspaceIdentity,
  jwtSessionVersion,
  jwtSessionWasInvalidated,
  shouldRefreshJwtWorkspaceState,
  stampJwtWorkspaceStateCheckedAt,
  type JwtWorkspaceStateToken,
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

describe("jwt session invalidation", () => {
  it("treats a missing token version as 0", () => {
    expect(jwtSessionVersion(undefined)).toBe(0);
    expect(jwtSessionWasInvalidated({}, 0)).toBe(false);
    expect(jwtSessionWasInvalidated({}, 1)).toBe(true);
  });

  it("clears workspace identity from the token", () => {
    const token = {
      workspaceUserId: "ws-1",
      sessionVersion: 2,
      mustChangePassword: true,
      passwordExpired: false,
    };
    clearJwtWorkspaceIdentity(token);
    expect(token.workspaceUserId).toBeUndefined();
    expect(token.sessionVersion).toBeUndefined();
    expect(token.mustChangePassword).toBeUndefined();
    expect(token.passwordExpired).toBeUndefined();
  });

  it("stamps the current workspace session onto the token", () => {
    const token: JwtWorkspaceStateToken = {};
    bindJwtWorkspaceIdentity(
      token,
      { id: "ws-1", mustChangePassword: false, sessionVersion: 3 },
      true
    );
    expect(token).toMatchObject({
      workspaceUserId: "ws-1",
      mustChangePassword: false,
      passwordExpired: true,
      sessionVersion: 3,
    });
  });
});
