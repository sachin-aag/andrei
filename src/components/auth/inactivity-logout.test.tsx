// @vitest-environment jsdom

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signOut } from "next-auth/react";
import {
  INACTIVITY_TIMEOUT_UPDATED_EVENT,
  InactivityLogout,
} from "@/components/auth/inactivity-logout";
import {
  beginSessionHold,
  releaseSessionHold,
  resetSessionHoldsForTests,
} from "@/lib/auth/session-activity";

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
    resetSessionHoldsForTests();
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

  it("uses admin timeout updates without a page reload", () => {
    render(<InactivityLogout timeoutMinutes={10} userId="user-1" />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(INACTIVITY_TIMEOUT_UPDATED_EVENT, {
          detail: { timeoutMinutes: 1 },
        })
      );
    });

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });

  it("does not sign out while a session hold is active", () => {
    beginSessionHold("document-library-upload");
    render(<InactivityLogout timeoutMinutes={1} userId="user-1" />);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(signOut).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("starts a fresh idle window after a session hold ends", () => {
    beginSessionHold("document-library-upload");
    render(<InactivityLogout timeoutMinutes={1} userId="user-1" />);

    act(() => {
      vi.advanceTimersByTime(45_000);
      releaseSessionHold("document-library-upload");
      vi.advanceTimersByTime(59_999);
    });
    expect(signOut).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});

