import { describe, expect, it } from "vitest";
import {
  closeIncompleteChatToolHistory,
  closeIncompleteChatToolParts,
  INCOMPLETE_TOOL_INTERRUPT_MESSAGE,
} from "./tool-part-repair";
import type { UIMessage } from "ai";

describe("closeIncompleteChatToolParts", () => {
  it("closes an input-available chip so convertToModelMessages has a result", () => {
    const parts = [
      {
        type: "tool-search_documents",
        toolCallId: "call_1",
        state: "input-available",
        input: { query: "Media Fill" },
      },
    ];
    expect(closeIncompleteChatToolParts(parts)).toEqual([
      {
        type: "tool-search_documents",
        toolCallId: "call_1",
        state: "output-error",
        errorText: INCOMPLETE_TOOL_INTERRUPT_MESSAGE,
        input: { query: "Media Fill" },
        output: { status: "interrupted", reason: "incomplete" },
      },
    ]);
  });

  it("leaves finished tool chips unchanged", () => {
    const parts = [
      {
        type: "tool-search_documents",
        toolCallId: "call_1",
        state: "output-available",
        output: { returnedCount: 2 },
      },
    ];
    expect(closeIncompleteChatToolParts(parts)[0]).toBe(parts[0]);
  });
});

describe("closeIncompleteChatToolHistory", () => {
  it("repairs stuck sessions before convertToModelMessages", () => {
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-continue_document_review",
            toolCallId: "call_orphan",
            state: "input-available",
            input: {},
          },
        ],
      },
    ];
    const repaired = closeIncompleteChatToolHistory(messages);
    const part = repaired[0]?.parts[0] as { state?: string; output?: unknown };
    expect(part.state).toBe("output-error");
    expect(part.output).toEqual({ status: "interrupted", reason: "incomplete" });
  });
});
