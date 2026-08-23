import { describe, expect, it, vi } from "vitest";
import {
  AGENT_DONE_MIN_ELAPSED_MS,
  agentDoneNotificationCopy,
  elapsedSince,
  isAgentDonePageUnfocused,
  notifyAgentDone,
  shouldAnnounceAgentDone,
  shouldShowAgentDonePendingHint,
  type NotificationPermissionState,
} from "./notify-agent-done";

const copy = {
  title: "Assistant is done",
  body: "Finished a reply on deviation DEV-1.",
};

function deps() {
  return {
    pageUnfocused: vi.fn(() => false),
    notificationPermission: vi.fn(
      (): NotificationPermissionState => "granted"
    ),
    notifySystem: vi.fn(),
    notifyInApp: vi.fn(),
    playSound: vi.fn(),
  };
}

describe("agentDoneNotificationCopy", () => {
  it("includes the document noun and number when present", () => {
    expect(
      agentDoneNotificationCopy({
        documentNoun: "design verification",
        documentNo: "DV-09",
      })
    ).toEqual({
      title: "Assistant is done",
      body: "Finished a reply on design verification DV-09.",
    });
  });

  it("falls back when the document number is blank", () => {
    expect(
      agentDoneNotificationCopy({
        documentNoun: "deviation",
        documentNo: "   ",
      })
    ).toEqual({
      title: "Assistant is done",
      body: "The assistant finished its reply.",
    });
  });
});

describe("shouldAnnounceAgentDone", () => {
  it("announces only when a successful turn lasted at least 5 seconds", () => {
    expect(AGENT_DONE_MIN_ELAPSED_MS).toBe(5_000);
    expect(shouldAnnounceAgentDone({})).toBe(false);
    expect(
      shouldAnnounceAgentDone({ elapsedMs: AGENT_DONE_MIN_ELAPSED_MS - 1 })
    ).toBe(false);
    expect(
      shouldAnnounceAgentDone({ elapsedMs: AGENT_DONE_MIN_ELAPSED_MS })
    ).toBe(true);
  });

  it("skips abort, disconnect, error, and empty assistant turns", () => {
    const long = { elapsedMs: AGENT_DONE_MIN_ELAPSED_MS + 1 };
    expect(shouldAnnounceAgentDone({ ...long, isAbort: true })).toBe(false);
    expect(shouldAnnounceAgentDone({ ...long, isDisconnect: true })).toBe(false);
    expect(shouldAnnounceAgentDone({ ...long, isError: true })).toBe(false);
    expect(shouldAnnounceAgentDone({ ...long, emptyAssistant: true })).toBe(
      false
    );
  });
});

describe("elapsedSince", () => {
  it("returns 0 when the run never started", () => {
    expect(elapsedSince(null, 12_000)).toBe(0);
  });

  it("subtracts the start time from now", () => {
    expect(elapsedSince(1_000, 6_000)).toBe(5_000);
  });
});

describe("shouldShowAgentDonePendingHint", () => {
  it("appears at 5 seconds only when notifications are on", () => {
    expect(
      shouldShowAgentDonePendingHint({
        notifications: true,
        elapsedMs: AGENT_DONE_MIN_ELAPSED_MS - 1,
      })
    ).toBe(false);
    expect(
      shouldShowAgentDonePendingHint({
        notifications: true,
        elapsedMs: AGENT_DONE_MIN_ELAPSED_MS,
      })
    ).toBe(true);
    expect(
      shouldShowAgentDonePendingHint({
        notifications: false,
        elapsedMs: AGENT_DONE_MIN_ELAPSED_MS,
      })
    ).toBe(false);
  });
});

describe("notifyAgentDone", () => {
  it("shows a silent in-app notice by default when the tab is visible", () => {
    const spies = deps();
    notifyAgentDone({ notifications: true, sound: false }, copy, spies);
    expect(spies.notifyInApp).toHaveBeenCalledWith(copy.title, copy.body);
    expect(spies.notifySystem).not.toHaveBeenCalled();
    expect(spies.playSound).not.toHaveBeenCalled();
  });

  it("uses a system notification when this page is unfocused and permission is granted", () => {
    const spies = deps();
    spies.pageUnfocused.mockReturnValue(true);
    notifyAgentDone({ notifications: true, sound: false }, copy, spies);
    expect(spies.notifySystem).toHaveBeenCalledWith(copy.title, copy.body);
    expect(spies.notifyInApp).not.toHaveBeenCalled();
    expect(spies.playSound).not.toHaveBeenCalled();
  });

  it("plays sound without a notice when only sound is on", () => {
    const spies = deps();
    spies.pageUnfocused.mockReturnValue(true);
    notifyAgentDone({ notifications: false, sound: true }, copy, spies);
    expect(spies.playSound).toHaveBeenCalledOnce();
    expect(spies.notifySystem).not.toHaveBeenCalled();
    expect(spies.notifyInApp).not.toHaveBeenCalled();
  });

  it("can play sound and show a notice together", () => {
    const spies = deps();
    notifyAgentDone({ notifications: true, sound: true }, copy, spies);
    expect(spies.playSound).toHaveBeenCalledOnce();
    expect(spies.notifyInApp).toHaveBeenCalledWith(copy.title, copy.body);
  });

  it("does nothing when both settings are off", () => {
    const spies = deps();
    notifyAgentDone({ notifications: false, sound: false }, copy, spies);
    expect(spies.playSound).not.toHaveBeenCalled();
    expect(spies.notifySystem).not.toHaveBeenCalled();
    expect(spies.notifyInApp).not.toHaveBeenCalled();
  });

  it("falls back to in-app when desktop permission is missing", () => {
    const spies = deps();
    spies.pageUnfocused.mockReturnValue(true);
    spies.notificationPermission.mockReturnValue("denied");
    notifyAgentDone({ notifications: true, sound: false }, copy, spies);
    expect(spies.notifyInApp).toHaveBeenCalledWith(copy.title, copy.body);
    expect(spies.notifySystem).not.toHaveBeenCalled();
  });
});

describe("isAgentDonePageUnfocused", () => {
  it("is false when this page is visible and focused", () => {
    expect(
      isAgentDonePageUnfocused({
        hidden: false,
        visibilityState: "visible",
        hasFocus: () => true,
      })
    ).toBe(false);
  });

  it("is true for another tab (page hidden)", () => {
    expect(
      isAgentDonePageUnfocused({
        hidden: true,
        visibilityState: "hidden",
        hasFocus: () => false,
      })
    ).toBe(true);
  });

  it("is true for another window that left this page visible", () => {
    expect(
      isAgentDonePageUnfocused({
        hidden: false,
        visibilityState: "visible",
        hasFocus: () => false,
      })
    ).toBe(true);
  });

  it("is false when there is no page (server)", () => {
    expect(isAgentDonePageUnfocused(null)).toBe(false);
  });
});
