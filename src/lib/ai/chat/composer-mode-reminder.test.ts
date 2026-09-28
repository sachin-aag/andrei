import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import {
  composerModeReminderText,
  composerModeTurnRule,
  messagesWithComposerModeReminder,
} from "./composer-mode-reminder";

describe("composerModeReminderText", () => {
  it("tells Agent to ignore a stale Ask-mode note", () => {
    const text = composerModeReminderText("agent");
    expect(text).toContain("THIS SEND: Agent mode");
    expect(text).toContain("Ignore any earlier assistant note");
    expect(text).toContain("still in Ask mode");
  });

  it("keeps Ask from claiming the whole session is locked", () => {
    const text = composerModeReminderText("plan");
    expect(text).toContain("THIS SEND: Ask mode");
    expect(text).toContain("per message, not the whole thread");
    expect(text).toContain("Do not say the whole session is locked in Ask");
  });
});

describe("composerModeTurnRule", () => {
  it("is per-send for Agent and Ask", () => {
    expect(composerModeTurnRule("agent")).toContain("This send is Agent");
    expect(composerModeTurnRule("agent")).toContain("stale");
    expect(composerModeTurnRule("plan")).toContain("This send is Ask");
    expect(composerModeTurnRule("plan")).not.toContain("This send is Agent");
  });
});

describe("messagesWithComposerModeReminder", () => {
  it("inserts the stamp immediately before the latest user message", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "what goes in these rows?" },
      {
        role: "assistant",
        content:
          "(Note: We are currently in Ask mode. You can switch to Agent mode to have these rows populated.)",
      },
      { role: "user", content: "I switched to Agent — fill them" },
    ];
    const next = messagesWithComposerModeReminder(messages, "agent");
    expect(next).toHaveLength(4);
    expect(next[2]).toEqual({
      role: "system",
      content: composerModeReminderText("agent"),
    });
    expect(next[3]).toEqual(messages[2]);
    expect(next[0]).toEqual(messages[0]);
    expect(next[1]).toEqual(messages[1]);
  });

  it("appends when there is no user message", () => {
    const next = messagesWithComposerModeReminder([], "plan");
    expect(next).toEqual([
      { role: "system", content: composerModeReminderText("plan") },
    ]);
  });
});
