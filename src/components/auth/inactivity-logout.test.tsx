// @vitest-environment jsdom

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signOut } from "next-auth/react";
import { InactivityLogout } from "@/components/auth/inactivity-logout";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

describe("InactivityLogout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T00:00:00.000Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("signs out after the configured inactive interval", () => {
    render(<InactivityLogout timeoutMinutes={1} userId="user-1" />);

    act(() => {
      vi.advanceTimersByTime(59_999);
    });
    expect(signOut).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });

  it("resets the logout timer when activity occurs", () => {
    render(<InactivityLogout timeoutMinutes={1} userId="user-1" />);

    act(() => {
      vi.advanceTimersByTime(30_000);
      fireEvent.keyDown(window);
      vi.advanceTimersByTime(59_999);
    });
    expect(signOut).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });

  it("does not sign out when inactivity timeout is disabled", () => {
    render(<InactivityLogout timeoutMinutes={0} userId="user-1" />);

    act(() => {
      vi.advanceTimersByTime(60 * 60_000);
    });
    expect(signOut).not.toHaveBeenCalled();
  });
});

