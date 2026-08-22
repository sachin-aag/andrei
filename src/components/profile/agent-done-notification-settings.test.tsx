// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentDoneNotificationSettings } from "@/components/profile/agent-done-notification-settings";
import {
  readAgentDonePrefs,
  resetAgentDonePrefsStore,
} from "@/lib/notifications/agent-done-prefs";

const playAgentDoneSound = vi.fn();
const requestPermission = vi.fn(async () => "granted" as const);

vi.mock("@/lib/notifications/notify-agent-done", () => ({
  playAgentDoneSound: () => playAgentDoneSound(),
  readNotificationPermission: () => "default",
  requestAgentDoneNotificationPermission: () => requestPermission(),
  unlockAgentDoneAudio: vi.fn(),
}));

describe("AgentDoneNotificationSettings", () => {
  beforeEach(() => {
    resetAgentDonePrefsStore();
    playAgentDoneSound.mockClear();
    requestPermission.mockClear();
    const map = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetAgentDonePrefsStore();
  });

  it("defaults to notifications on and sound off", () => {
    render(<AgentDoneNotificationSettings userId="user-a" />);
    expect(
      screen.getByRole("checkbox", {
        name: /show a notification when the assistant finishes/i,
      })
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: /play a sound when the assistant finishes/i,
      })
    ).not.toBeChecked();
  });

  it("toggles the two settings independently and persists them", async () => {
    const user = userEvent.setup();
    render(<AgentDoneNotificationSettings userId="user-a" />);

    await user.click(
      screen.getByRole("checkbox", {
        name: /show a notification when the assistant finishes/i,
      })
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /play a sound when the assistant finishes/i,
      })
    );

    expect(readAgentDonePrefs("user-a")).toEqual({
      notifications: false,
      sound: true,
    });
    expect(
      screen.getByRole("checkbox", {
        name: /show a notification when the assistant finishes/i,
      })
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: /play a sound when the assistant finishes/i,
      })
    ).toBeChecked();
  });

  it("requests desktop permission when notifications are turned on", async () => {
    const user = userEvent.setup();
    render(<AgentDoneNotificationSettings userId="user-a" />);

    const checkbox = screen.getByRole("checkbox", {
      name: /show a notification when the assistant finishes/i,
    });
    await user.click(checkbox);
    await user.click(checkbox);

    expect(requestPermission).toHaveBeenCalled();
  });

  it("plays a sample chime without changing prefs", async () => {
    const user = userEvent.setup();
    render(<AgentDoneNotificationSettings userId="user-a" />);

    await user.click(screen.getByRole("button", { name: /play sample/i }));

    expect(playAgentDoneSound).toHaveBeenCalledOnce();
    expect(readAgentDonePrefs("user-a")).toEqual({
      notifications: true,
      sound: false,
    });
  });
});
