// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ChatVoiceButton,
  VOICE_RECORDING_HINT,
  VOICE_TRANSCRIBING_HINT,
} from "./chat-voice-button";

describe("ChatVoiceButton", () => {
  it("starts voice input from the idle mic", async () => {
    const onToggle = vi.fn();
    render(
      <ChatVoiceButton
        recording={false}
        requesting={false}
        transcribing={false}
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

  it("shows a larger wave, stop hint, language chevron, and a stop square while recording", async () => {
    const onToggle = vi.fn();
    render(
      <ChatVoiceButton
        recording
        requesting={false}
        transcribing={false}
        level={0.8}
        disabled={false}
        targetingAnalytics
        onToggle={onToggle}
      />
    );
    expect(screen.getByTestId("analytics-chat-voice-recording")).toBeInTheDocument();
    expect(screen.getByTestId("chat-voice-level").querySelectorAll("span")).toHaveLength(
      18
    );
    expect(screen.getByTestId("analytics-chat-voice-hint")).toHaveTextContent(
      VOICE_RECORDING_HINT
    );
    expect(screen.getByTestId("analytics-chat-voice-language")).toHaveAttribute(
      "aria-label",
      "Voice input language"
    );
    const button = screen.getByTestId("analytics-chat-voice-input");
    expect(button).toHaveAttribute("aria-label", "Stop voice input");
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("says transcribing after stop while the audio is still being recognized", () => {
    render(
      <ChatVoiceButton
        recording
        requesting={false}
        transcribing
        level={0.2}
        disabled={false}
        targetingAnalytics={false}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByTestId("chat-voice-hint")).toHaveTextContent(
      VOICE_TRANSCRIBING_HINT
    );
    expect(screen.getByTestId("chat-voice-input")).toBeDisabled();
  });

  it("does not stop recording when opening the language menu", async () => {
    const onToggle = vi.fn();
    render(
      <ChatVoiceButton
        recording
        requesting={false}
        transcribing={false}
        level={0.4}
        disabled={false}
        targetingAnalytics={false}
        onToggle={onToggle}
      />
    );
    await userEvent.click(screen.getByTestId("chat-voice-language"));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
