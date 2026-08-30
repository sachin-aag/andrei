import type { UIMessage } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assistantPartsHaveVisibleContent,
  assistantPartsHaveVisibleText,
  assistantProgressSignature,
  chatWatchdogPhase,
  formatChatLlmError,
  isFailedChatFinishReason,
  partsForPersistedAssistantTurn,
  shouldShowEmptyAssistantError,
  writtenColumnNamesFromParts,
  CHAT_ASSISTANT_ERROR_MESSAGE,
  CHAT_ASSISTANT_INCOMPLETE_TURN_MESSAGE,
  CHAT_ASSISTANT_INTERRUPTED_MESSAGE,
  CHAT_ASSISTANT_STEP_BUDGET_MESSAGE,
  CHAT_CLIENT_GIVE_UP_MS,
  CHAT_CLIENT_STALE_MS,
  CHAT_CONSUME_STREAM_BUDGET_MS,
  CHAT_FUNCTION_MAX_DURATION_SEC,
  CHAT_SERVER_ABORT_MS,
  consumeAssistantStreamWithBudget,
} from "./assistant-turn";
import { CHAT_TURN_STALE_MS } from "./background-turn-status";

describe("assistantPartsHaveVisibleContent", () => {
  it("is false for missing, empty, or whitespace-only text", () => {
    expect(assistantPartsHaveVisibleContent(undefined)).toBe(false);
    expect(assistantPartsHaveVisibleContent([])).toBe(false);
    expect(assistantPartsHaveVisibleContent([{ type: "text", text: "   " }])).toBe(
      false
    );
    expect(
      assistantPartsHaveVisibleContent([{ type: "reasoning", text: "thoughts" }])
    ).toBe(true);
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

  it("treats tool chips without prose as having no visible text", () => {
    expect(
      assistantPartsHaveVisibleText([
        { type: "tool-search_documents" },
      ])
    ).toBe(false);
    expect(assistantPartsHaveVisibleText([{ type: "text", text: "ok" }])).toBe(
      true
    );
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
    expect(CHAT_CONSUME_STREAM_BUDGET_MS).toBeGreaterThan(CHAT_SERVER_ABORT_MS);
    expect(CHAT_CONSUME_STREAM_BUDGET_MS).toBeLessThan(
      CHAT_FUNCTION_MAX_DURATION_SEC * 1000
    );
    expect(CHAT_CLIENT_GIVE_UP_MS).toBeGreaterThan(CHAT_SERVER_ABORT_MS);
    expect(CHAT_CLIENT_GIVE_UP_MS).toBeLessThan(
      CHAT_FUNCTION_MAX_DURATION_SEC * 1000
    );
    expect(CHAT_CLIENT_STALE_MS).toBeLessThan(CHAT_CLIENT_GIVE_UP_MS);
    expect(CHAT_TURN_STALE_MS).toBeGreaterThan(
      CHAT_FUNCTION_MAX_DURATION_SEC * 1000
    );
  });
});

describe("consumeAssistantStreamWithBudget", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves completed when consume finishes", async () => {
    await expect(
      consumeAssistantStreamWithBudget(async () => undefined, 50)
    ).resolves.toBe("completed");
  });

  it("times out a hung consume so after() can still clear the turn", async () => {
    vi.useFakeTimers();
    const hung = consumeAssistantStreamWithBudget(
      () => new Promise(() => {}),
      20
    );
    await vi.advanceTimersByTimeAsync(20);
    await expect(hung).resolves.toBe("timed_out");
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
    ).toEqual({
      parts,
      emptyFailure: false,
      interrupted: false,
      stepBudgetExhausted: false,
      incomplete: false,
    });
  });

  it("persists an interrupted line for empty aborted turns", () => {
    expect(
      partsForPersistedAssistantTurn({ parts: [], isAborted: true })
    ).toEqual({
      parts: [{ type: "text", text: CHAT_ASSISTANT_INTERRUPTED_MESSAGE }],
      emptyFailure: true,
      interrupted: true,
      stepBudgetExhausted: false,
      incomplete: true,
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
      stepBudgetExhausted: false,
      incomplete: true,
    });
  });

  it("does not mark a completed aborted reply as interrupted", () => {
    const parts = [{ type: "text" as const, text: "Draft Define." }];
    expect(
      partsForPersistedAssistantTurn({ parts, isAborted: true })
    ).toEqual({
      parts,
      emptyFailure: false,
      interrupted: false,
      stepBudgetExhausted: false,
      incomplete: false,
    });
  });

  it("persists a user-visible error line for empty finished turns", () => {
    expect(
      partsForPersistedAssistantTurn({ parts: [], isAborted: false })
    ).toEqual({
      parts: [{ type: "text", text: CHAT_ASSISTANT_ERROR_MESSAGE }],
      emptyFailure: true,
      interrupted: false,
      stepBudgetExhausted: false,
      incomplete: false,
    });
  });

  it("appends a step-budget notice when tools ran but there is no prose", () => {
    const parts = [
      { type: "tool-search_documents", toolCallId: "call_1" },
    ] as unknown as UIMessage["parts"];
    expect(
      partsForPersistedAssistantTurn({
        parts,
        isAborted: false,
        stepBudgetExhausted: true,
      })
    ).toEqual({
      parts: [
        parts[0],
        { type: "text", text: CHAT_ASSISTANT_STEP_BUDGET_MESSAGE },
      ],
      emptyFailure: false,
      interrupted: false,
      stepBudgetExhausted: true,
      incomplete: true,
    });
  });

  it("appends an incomplete notice when the model stops on tool-calls with no prose", () => {
    const parts = [
      {
        type: "tool-write_column",
        toolCallId: "call_1",
        output: { status: "written", columnName: "Temp" },
      },
      {
        type: "tool-write_column",
        toolCallId: "call_2",
        output: {
          status: "written",
          columnName: "pH",
          columns: [
            { columnName: "Temp" },
            { columnName: "pH" },
          ],
        },
      },
    ] as unknown as UIMessage["parts"];
    expect(writtenColumnNamesFromParts(parts)).toEqual(["Temp", "pH"]);
    expect(
      partsForPersistedAssistantTurn({
        parts,
        isAborted: false,
        finishReason: "tool-calls",
      })
    ).toEqual({
      parts: [
        parts[0],
        parts[1],
        {
          type: "text",
          text: "I stopped after writing Temp and pH and did not finish this turn. Ask me to continue if any columns are still empty.",
        },
      ],
      emptyFailure: false,
      interrupted: false,
      stepBudgetExhausted: false,
      incomplete: true,
    });
  });

  it("uses the generic incomplete line when tool-calls stop with no writes", () => {
    const parts = [
      { type: "tool-search_documents", toolCallId: "call_1" },
    ] as unknown as UIMessage["parts"];
    expect(
      partsForPersistedAssistantTurn({
        parts,
        isAborted: false,
        finishReason: "tool-calls",
      })
    ).toEqual({
      parts: [
        parts[0],
        { type: "text", text: CHAT_ASSISTANT_INCOMPLETE_TURN_MESSAGE },
      ],
      emptyFailure: false,
      interrupted: false,
      stepBudgetExhausted: false,
      incomplete: true,
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
