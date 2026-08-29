import { InvalidToolInputError, NoSuchToolError, type ToolSet } from "ai";
import { describe, expect, it } from "vitest";
import {
  normalizeToolName,
  repairChatToolCall,
  resolveRepairedToolName,
} from "./repair-tool-call";

const AVAILABLE = [
  "read_section",
  "read_document_page",
  "search_documents",
  "document_outline",
] as const;

const TOOLS = Object.fromEntries(AVAILABLE.map((name) => [name, {}])) as ToolSet;

describe("normalizeToolName", () => {
  it("strips spaces and other punctuation", () => {
    expect(normalizeToolName("read_ document_page")).toBe("read_document_page");
    expect(normalizeToolName("read-document.page")).toBe("read-documentpage");
  });
});

describe("resolveRepairedToolName", () => {
  it("keeps an exact registered name", () => {
    expect(resolveRepairedToolName("read_document_page", AVAILABLE)).toBe(
      "read_document_page"
    );
  });

  it("maps the incident name with a space onto read_document_page", () => {
    expect(resolveRepairedToolName("read_ document_page", AVAILABLE)).toBe(
      "read_document_page"
    );
  });

  it("maps a unique case-insensitive name", () => {
    expect(resolveRepairedToolName("READ_DOCUMENT_PAGE", AVAILABLE)).toBe(
      "read_document_page"
    );
  });

  it("does not fuzzy-match a prefix onto a longer tool", () => {
    expect(resolveRepairedToolName("read", AVAILABLE)).toBeNull();
    expect(resolveRepairedToolName("read_document", AVAILABLE)).toBeNull();
    expect(resolveRepairedToolName("search", AVAILABLE)).toBeNull();
  });

  it("returns null for an unknown name", () => {
    expect(resolveRepairedToolName("not_a_tool", AVAILABLE)).toBeNull();
    expect(resolveRepairedToolName("   ", AVAILABLE)).toBeNull();
  });
});

describe("repairChatToolCall", () => {
  const base = {
    system: undefined,
    messages: [],
    inputSchema: async () => ({ type: "object" as const }),
  };

  it("rewrites a NoSuchToolError with a space in the name", async () => {
    const repaired = await repairChatToolCall({
      ...base,
      toolCall: {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "read_ document_page",
        input: '{"documentId":"doc_1","page":1}',
      },
      tools: TOOLS,
      error: new NoSuchToolError({
        toolName: "read_ document_page",
        availableTools: [...AVAILABLE],
      }),
    });
    expect(repaired?.toolName).toBe("read_document_page");
    expect(repaired?.toolCallId).toBe("call_1");
  });

  it("does not rewrite schema errors or unknown names", async () => {
    await expect(
      repairChatToolCall({
        ...base,
        toolCall: {
          type: "tool-call",
          toolCallId: "call_2",
          toolName: "read_document_page",
          input: "{",
        },
        tools: TOOLS,
        error: new InvalidToolInputError({
          toolName: "read_document_page",
          toolInput: "{",
          cause: new Error("invalid json"),
        }),
      })
    ).resolves.toBeNull();

    await expect(
      repairChatToolCall({
        ...base,
        toolCall: {
          type: "tool-call",
          toolCallId: "call_3",
          toolName: "invented_tool",
          input: "{}",
        },
        tools: TOOLS,
        error: new NoSuchToolError({
          toolName: "invented_tool",
          availableTools: [...AVAILABLE],
        }),
      })
    ).resolves.toBeNull();
  });
});
