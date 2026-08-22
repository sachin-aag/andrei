import { describe, expect, it, vi } from "vitest";
import {
  agentDoneNotificationCopy,
  notifyAgentDone,
  shouldAnnounceAgentDone,
  type NotificationPermissionState,
} from "./notify-agent-done";

const copy = {
  title: "Assistant is done",
  body: "Finished a reply on deviation DEV-1.",
};

function deps() {
  return {
    nowHidden: vi.fn(() => false),
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
  it("announces a successful finished turn", () => {
    expect(shouldAnnounceAgentDone({})).toBe(true);
  });

  it("skips abort, disconnect, error, and empty assistant turns", () => {
    expect(shouldAnnounceAgentDone({ isAbort: true })).toBe(false);
    expect(shouldAnnounceAgentDone({ isDisconnect: true })).toBe(false);
    expect(shouldAnnounceAgentDone({ isError: true })).toBe(false);
    expect(shouldAnnounceAgentDone({ emptyAssistant: true })).toBe(false);
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

  it("uses a system notification when the tab is hidden and permission is granted", () => {
    const spies = deps();
    spies.nowHidden.mockReturnValue(true);
    notifyAgentDone({ notifications: true, sound: false }, copy, spies);
    expect(spies.notifySystem).toHaveBeenCalledWith(copy.title, copy.body);
    expect(spies.notifyInApp).not.toHaveBeenCalled();
    expect(spies.playSound).not.toHaveBeenCalled();
  });

  it("plays sound without a notice when only sound is on", () => {
    const spies = deps();
    spies.nowHidden.mockReturnValue(true);
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
    spies.nowHidden.mockReturnValue(true);
    spies.notificationPermission.mockReturnValue("denied");
    notifyAgentDone({ notifications: true, sound: false }, copy, spies);
    expect(spies.notifyInApp).toHaveBeenCalledWith(copy.title, copy.body);
    expect(spies.notifySystem).not.toHaveBeenCalled();
  });
});
