import { describe, expect, it } from "vitest";
import {
  searchLoopDirective,
  withoutSearchTool,
  type SearchLoopStep,
} from "./search-loop";

function step(
  names: string[],
  searchHits?: number
): SearchLoopStep {
  const toolCalls = names.map((toolName) => ({ toolName }));
  if (searchHits === undefined) {
    return { toolCalls };
  }
  return {
    toolCalls,
    toolResults: names
      .filter((toolName) => toolName === "search_documents")
      .map((toolName) => ({
        toolName,
        output: { returnedCount: searchHits, seenPages: [] },
      })),
  };
}

describe("searchLoopDirective", () => {
  it("lets the first empty grep through and hides search after two empties", () => {
    expect(searchLoopDirective([step(["search_documents"], 0)])).toBe(
      "continue"
    );
    expect(
      searchLoopDirective([
        step(["search_documents"], 0),
        step(["search_documents"], 0),
      ])
    ).toBe("read");
  });

  it("hides search as soon as a grep returns a cited page", () => {
    expect(searchLoopDirective([step(["search_documents"], 3)])).toBe("read");
  });

  it("hides search after a page read, scan, outline, or extract", () => {
    expect(searchLoopDirective([step(["read_document_page"])])).toBe("read");
    expect(searchLoopDirective([step(["scan_attachments"])])).toBe("read");
    expect(searchLoopDirective([step(["document_outline"])])).toBe("read");
    expect(searchLoopDirective([step(["extract_numeric_series"])])).toBe(
      "read"
    );
  });

  it("does not treat read_section or read_worksheet as locate progress", () => {
    expect(
      searchLoopDirective([
        step(["search_documents"], 0),
        step(["read_section"]),
        step(["read_worksheet"]),
      ])
    ).toBe("continue");
  });
});

describe("withoutSearchTool", () => {
  it("drops search_documents from an activeTools list", () => {
    expect(
      withoutSearchTool(["read_section", "search_documents", "ask_user"])
    ).toEqual(["read_section", "ask_user"]);
  });
});
