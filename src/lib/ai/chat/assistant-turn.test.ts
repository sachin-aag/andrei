import { describe, expect, it } from "vitest";
import {
  assistantPartsHaveVisibleContent,
  formatChatLlmError,
  isFailedChatFinishReason,
  partsForPersistedAssistantTurn,
  shouldShowEmptyAssistantError,
  CHAT_ASSISTANT_ERROR_MESSAGE,
} from "./assistant-turn";

describe("assistantPartsHaveVisibleContent", () => {
  it("is false for missing, empty, or whitespace-only text", () => {
    expect(assistantPartsHaveVisibleContent(undefined)).toBe(false);
    expect(assistantPartsHaveVisibleContent([])).toBe(false);
    expect(assistantPartsHaveVisibleContent([{ type: "text", text: "   " }])).toBe(
      false
    );
    expect(
      assistantPartsHaveVisibleContent([{ type: "reasoning", text: "thoughts" }])
    ).toBe(false);
  });

  it("is true for visible text, files, or tool parts", () => {
    expect(
      assistantPartsHaveVisibleContent([{ type: "text", text: "Draft Define." }])
    ).toBe(true);
    expect(
      assistantPartsHaveVisibleContent([
        { type: "file", text: undefined },
      ])
    ).toBe(true);
    expect(
      assistantPartsHaveVisibleContent([
        { type: "tool-read_section" },
      ])
    ).toBe(true);
  });
});

describe("isFailedChatFinishReason", () => {
  it("flags error and content-filter", () => {
    expect(isFailedChatFinishReason("error")).toBe(true);
    expect(isFailedChatFinishReason("content-filter")).toBe(true);
    expect(isFailedChatFinishReason("stop")).toBe(false);
    expect(isFailedChatFinishReason("tool-calls")).toBe(false);
    expect(isFailedChatFinishReason(undefined)).toBe(false);
  });
});

describe("shouldShowEmptyAssistantError", () => {
  it("hides the error while the turn is still streaming", () => {
    expect(
      shouldShowEmptyAssistantError({ parts: [], streaming: true })
    ).toBe(false);
  });

  it("shows the error after an empty finished turn", () => {
    expect(
      shouldShowEmptyAssistantError({ parts: [], streaming: false })
    ).toBe(true);
    expect(
      shouldShowEmptyAssistantError({
        parts: [{ type: "text", text: "ok" }],
        streaming: false,
      })
    ).toBe(false);
  });
});

describe("partsForPersistedAssistantTurn", () => {
  it("leaves aborted and visible turns unchanged", () => {
    const parts = [{ type: "text" as const, text: "ok" }];
    expect(
      partsForPersistedAssistantTurn({ parts, isAborted: false })
    ).toEqual({ parts, emptyFailure: false });
    expect(
      partsForPersistedAssistantTurn({ parts: [], isAborted: true })
    ).toEqual({ parts: [], emptyFailure: false });
  });

  it("persists a user-visible error line for empty finished turns", () => {
    expect(
      partsForPersistedAssistantTurn({ parts: [], isAborted: false })
    ).toEqual({
      parts: [{ type: "text", text: CHAT_ASSISTANT_ERROR_MESSAGE }],
      emptyFailure: true,
    });
  });
});

describe("formatChatLlmError", () => {
  it("formats Error instances for logs", () => {
    expect(formatChatLlmError(new TypeError("no content"))).toBe(
      "TypeError: no content"
    );
  });
});
