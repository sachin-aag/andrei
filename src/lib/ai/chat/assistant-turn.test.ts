import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  assistantPartsHaveVisibleContent,
  assistantProgressSignature,
  chatWatchdogPhase,
  formatChatLlmError,
  isFailedChatFinishReason,
  partsForPersistedAssistantTurn,
  shouldShowEmptyAssistantError,
  CHAT_ASSISTANT_ERROR_MESSAGE,
  CHAT_ASSISTANT_INTERRUPTED_MESSAGE,
  CHAT_CLIENT_GIVE_UP_MS,
  CHAT_CLIENT_STALE_MS,
  CHAT_FUNCTION_MAX_DURATION_SEC,
  CHAT_SERVER_ABORT_MS,
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

describe("deadline constants", () => {
  it("aborts the stream before Vercel can kill the isolate", () => {
    expect(CHAT_FUNCTION_MAX_DURATION_SEC).toBe(300);
    expect(CHAT_SERVER_ABORT_MS).toBeLessThan(CHAT_FUNCTION_MAX_DURATION_SEC * 1000);
    expect(CHAT_CLIENT_GIVE_UP_MS).toBeGreaterThan(CHAT_SERVER_ABORT_MS);
    expect(CHAT_CLIENT_GIVE_UP_MS).toBeLessThan(
      CHAT_FUNCTION_MAX_DURATION_SEC * 1000
    );
    expect(CHAT_CLIENT_STALE_MS).toBeLessThan(CHAT_CLIENT_GIVE_UP_MS);
  });
});

describe("assistantProgressSignature", () => {
  it("changes when tool state or text length changes", () => {
    expect(assistantProgressSignature([])).toBe("");
    expect(
      assistantProgressSignature([{ type: "tool-search_documents", state: "input-available" }])
    ).not.toBe(
      assistantProgressSignature([
        { type: "tool-search_documents", state: "output-available" },
      ])
    );
    expect(assistantProgressSignature([{ type: "text", text: "ab" }])).not.toBe(
      assistantProgressSignature([{ type: "text", text: "abcd" }])
    );
  });
});

describe("chatWatchdogPhase", () => {
  it("stays hidden until the turn is stale or over the give-up deadline", () => {
    expect(
      chatWatchdogPhase({ busy: false, elapsedMs: 999_000, silentMs: 999_000 })
    ).toBe("hidden");
    expect(
      chatWatchdogPhase({ busy: true, elapsedMs: 10_000, silentMs: 10_000 })
    ).toBe("hidden");
    expect(
      chatWatchdogPhase({
        busy: true,
        elapsedMs: CHAT_CLIENT_STALE_MS,
        silentMs: CHAT_CLIENT_STALE_MS,
      })
    ).toBe("stale");
    expect(
      chatWatchdogPhase({
        busy: true,
        elapsedMs: CHAT_CLIENT_GIVE_UP_MS,
        silentMs: 0,
      })
    ).toBe("give_up");
  });
});

describe("partsForPersistedAssistantTurn", () => {
  it("leaves a finished visible turn unchanged", () => {
    const parts = [{ type: "text" as const, text: "ok" }];
    expect(
      partsForPersistedAssistantTurn({ parts, isAborted: false })
    ).toEqual({ parts, emptyFailure: false, interrupted: false });
  });

  it("persists an interrupted line for empty aborted turns", () => {
    expect(
      partsForPersistedAssistantTurn({ parts: [], isAborted: true })
    ).toEqual({
      parts: [{ type: "text", text: CHAT_ASSISTANT_INTERRUPTED_MESSAGE }],
      emptyFailure: true,
      interrupted: true,
    });
  });

  it("keeps aborted tool progress and appends the interrupted line", () => {
    const parts = [
      { type: "tool-search_documents", toolCallId: "call_1" },
    ] as unknown as UIMessage["parts"];
    expect(
      partsForPersistedAssistantTurn({ parts, isAborted: true })
    ).toEqual({
      parts: [
        parts[0],
        { type: "text", text: CHAT_ASSISTANT_INTERRUPTED_MESSAGE },
      ],
      emptyFailure: false,
      interrupted: true,
    });
  });

  it("does not mark a completed aborted reply as interrupted", () => {
    const parts = [{ type: "text" as const, text: "Draft Define." }];
    expect(
      partsForPersistedAssistantTurn({ parts, isAborted: true })
    ).toEqual({ parts, emptyFailure: false, interrupted: false });
  });

  it("persists a user-visible error line for empty finished turns", () => {
    expect(
      partsForPersistedAssistantTurn({ parts: [], isAborted: false })
    ).toEqual({
      parts: [{ type: "text", text: CHAT_ASSISTANT_ERROR_MESSAGE }],
      emptyFailure: true,
      interrupted: false,
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
