import { NoSuchToolError, type ToolSet } from "ai";
import { describe, expect, it } from "vitest";
import {
  advertisedChatToolNames,
  isUnavailableToolStreamError,
  unavailableToolNameFromError,
  unsupportedChatToolHint,
  UNSUPPORTED_CHAT_TOOL_NAME,
  withUnsupportedChatToolFallback,
} from "./unsupported-tool";

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

  it("steers table edits away from a stripped edit_table", () => {
    const hint = unsupportedChatToolHint("edit_table");
    expect(hint).toContain("edit_table is not available this turn");
    expect(hint).toContain("Table and draft tools");
    expect(hint).not.toMatch(/The assistant hit an error/i);
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
