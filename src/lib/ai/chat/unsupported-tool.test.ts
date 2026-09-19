import { NoSuchToolError, type ToolSet } from "ai";
import { describe, expect, it } from "vitest";
import {
  advertisedChatToolNames,
  isUnavailableToolStreamError,
  stepsRequestedHiddenWriteTool,
  unavailableToolNameFromError,
  unsupportedChatToolHint,
  UNSUPPORTED_CHAT_TOOL_NAME,
  withUnlockedWriteTools,
  withUnsupportedChatToolFallback,
} from "./unsupported-tool";
import { DOCUMENT_WRITE_TOOL_SET } from "./user-intent";

describe("unsupported chat tool fallback", () => {
  it("stays off the advertised tool list", () => {
    const tools = withUnsupportedChatToolFallback(
      Object.fromEntries(
        ["read_section", "search_documents"].map((name) => [name, {}])
      ) as ToolSet
    );
    expect(tools[UNSUPPORTED_CHAT_TOOL_NAME]).toBeDefined();
    expect(advertisedChatToolNames(tools)).toEqual([
      "read_section",
      "search_documents",
    ]);
  });

  it("steers table edits to retry on the next step", () => {
    const hint = unsupportedChatToolHint("edit_table");
    expect(hint).toContain("edit_table is not available this step");
    expect(hint).toContain("unlock after this signal");
    expect(hint).not.toMatch(/The assistant hit an error/i);
  });

  it("detects a remapped hidden write tool from calls or results", () => {
    expect(
      stepsRequestedHiddenWriteTool(
        [
          {
            toolCalls: [
              {
                toolName: "unsupported_tool",
                input: { requestedTool: "edit_table" },
              },
            ],
          },
        ],
        DOCUMENT_WRITE_TOOL_SET
      )
    ).toBe(true);
    expect(
      stepsRequestedHiddenWriteTool(
        [
          {
            toolResults: [
              {
                toolName: "unsupported_tool",
                output: { requestedTool: "write_column" },
              },
            ],
          },
        ],
        DOCUMENT_WRITE_TOOL_SET
      )
    ).toBe(false);
    expect(
      stepsRequestedHiddenWriteTool(
        [{ toolCalls: [{ toolName: "read_section" }] }],
        DOCUMENT_WRITE_TOOL_SET
      )
    ).toBe(false);
  });

  it("unions registered write tools onto the advertised list", () => {
    expect(
      withUnlockedWriteTools(["read_section", "search_documents"], [
        "edit_table",
        "draft_field",
      ])
    ).toEqual(
      expect.arrayContaining([
        "read_section",
        "search_documents",
        "edit_table",
        "draft_field",
      ])
    );
    expect(withUnlockedWriteTools(["read_section"], [])).toEqual([
      "read_section",
    ]);
  });

  it("recognizes the production NoSuchToolError message", () => {
    const error = new NoSuchToolError({
      toolName: "edit_table",
      availableTools: [
        "read_section",
        "search_documents",
        "document_outline",
        "read_document_page",
        "start_document_review",
        "continue_document_review",
        "finish_document_review",
        "ask_user",
      ],
    });
    expect(isUnavailableToolStreamError(error)).toBe(true);
    expect(unavailableToolNameFromError(error)).toBe("edit_table");
    expect(isUnavailableToolStreamError(error.message)).toBe(true);
  });
});
