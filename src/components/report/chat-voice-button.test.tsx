// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatVoiceButton } from "./chat-voice-button";

describe("ChatVoiceButton", () => {
  it("starts voice input from the idle mic", async () => {
    const onToggle = vi.fn();
    render(
      <ChatVoiceButton
        recording={false}
        requesting={false}
        level={0}
        disabled={false}
        targetingAnalytics={false}
        onToggle={onToggle}
      />
    );
    const button = screen.getByTestId("chat-voice-input");
    expect(button).toHaveAttribute("aria-label", "Start voice input");
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows level bars while recording and uses the analytics test id", async () => {
    const onToggle = vi.fn();
    render(
      <ChatVoiceButton
        recording
        requesting={false}
        level={0.8}
        disabled={false}
        targetingAnalytics
        onToggle={onToggle}
      />
    );
    const button = screen.getByTestId("analytics-chat-voice-input");
    expect(button).toHaveAttribute("aria-label", "Stop voice input");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button.querySelectorAll("span span")).toHaveLength(5);
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
