// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CHAT_ASSISTANT_ERROR_MESSAGE,
  shouldShowChatClientError,
} from "@/lib/ai/chat/assistant-turn";
import {
  CHAT_PACE_OPTIONS,
  ChatBusyStatus,
  ComposerSelect,
  DOCUMENT_CHAT_MODE_OPTIONS,
} from "./chat-composer-controls";

describe("ComposerSelect", () => {
  it("renders the in-box Agent pill without a fixed width", () => {
    render(
      <ComposerSelect
        value="agent"
        options={DOCUMENT_CHAT_MODE_OPTIONS}
        onChange={() => {}}
        ariaLabel="Assistant mode"
        variant="pill"
      />
    );

    const trigger = screen.getByRole("combobox", { name: "Assistant mode" });
    expect(trigger.className).toContain("rounded-full");
    expect(trigger.className).not.toContain("w-[6rem]");
    expect(trigger).toHaveTextContent("Agent");
  });

  it("renders Quick/Deep as a ghost label without an icon", () => {
    render(
      <ComposerSelect
        value="quick"
        options={CHAT_PACE_OPTIONS}
        onChange={() => {}}
        ariaLabel="Answer depth"
        variant="ghost"
        showIcon={false}
      />
    );

    const trigger = screen.getByRole("combobox", { name: "Answer depth" });
    expect(trigger.className).toContain("bg-transparent");
    expect(trigger).toHaveTextContent("Quick");
    expect(trigger.querySelector("svg.lucide-zap")).toBeNull();
  });
});

describe("ChatBusyStatus with a leftover stream error", () => {
  it("keeps the background still-working copy and hides the red error", () => {
    const leftover = new TypeError("Failed to fetch");
    render(
      <div>
        <ChatBusyStatus
          mode="agent"
          stale={false}
          background
          willNotify
          onCancel={() => {}}
        />
        {shouldShowChatClientError({ error: leftover, busy: true }) ? (
          <p>{CHAT_ASSISTANT_ERROR_MESSAGE}</p>
        ) : null}
      </div>
    );

    expect(
      screen.getByText("Still working in the background…")
    ).toBeInTheDocument();
    expect(
      screen.getByText("We'll notify you when this is complete.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText(CHAT_ASSISTANT_ERROR_MESSAGE)
    ).not.toBeInTheDocument();
  });
});
