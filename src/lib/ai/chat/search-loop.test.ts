import { describe, expect, it } from "vitest";
import {
  documentAskUserDirective,
  searchLoopDirective,
  withoutAskUserTool,
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

  it("keeps search open after an identifier-only DQ protocol hit so IQ can still be grepped", () => {
    expect(
      searchLoopDirective([
        {
          toolCalls: [
            { toolName: "search_documents", input: { query: "URS-41" } },
          ],
          toolResults: [
            {
              toolName: "search_documents",
              output: {
                returnedCount: 1,
                seenPages: [
                  {
                    attachmentId: "dq",
                    pageNumber: 13,
                    filename: "Design Qualification.PDF",
                  },
                ],
                results: [
                  {
                    filename: "Design Qualification.PDF",
                    pageNumber: 13,
                  },
                ],
              },
            },
          ],
        },
      ])
    ).toBe("continue");
  });

  it("keeps search open after reading that DQ page until higher protocol families are queried", () => {
    expect(
      searchLoopDirective([
        {
          toolCalls: [
            { toolName: "search_documents", input: { query: "URS-41" } },
          ],
          toolResults: [
            {
              toolName: "search_documents",
              output: {
                returnedCount: 1,
                seenPages: [
                  {
                    attachmentId: "dq",
                    pageNumber: 13,
                    filename: "Design Qualification.PDF",
                  },
                ],
              },
            },
          ],
        },
        {
          toolCalls: [{ toolName: "read_document_page" }],
          toolResults: [
            {
              toolName: "read_document_page",
              output: {
                status: "found",
                filename: "Design Qualification.PDF",
                pageNumber: 13,
              },
            },
          ],
        },
      ])
    ).toBe("continue");
    expect(
      searchLoopDirective([
        {
          toolCalls: [
            {
              toolName: "search_documents",
              input: { queries: ["installation qualification gaskets"] },
            },
          ],
          toolResults: [
            {
              toolName: "search_documents",
              output: {
                returnedCount: 1,
                seenPages: [
                  {
                    attachmentId: "iq",
                    pageNumber: 42,
                    filename: "Installation Qualification.PDF",
                  },
                ],
              },
            },
          ],
        },
      ])
    ).toBe("continue");
    expect(
      searchLoopDirective([
        {
          toolCalls: [
            {
              toolName: "search_documents",
              input: {
                queries: [
                  "operational qualification gaskets",
                  "performance qualification gaskets",
                ],
              },
            },
          ],
          toolResults: [
            {
              toolName: "search_documents",
              output: {
                returnedCount: 1,
                seenPages: [
                  {
                    attachmentId: "pq",
                    pageNumber: 8,
                    filename: "Performance Qualification.PDF",
                  },
                ],
              },
            },
          ],
        },
      ])
    ).toBe("read");
  });

  it("hides search after a page read, scan, outline, or extract", () => {
    expect(searchLoopDirective([step(["read_document_page"])])).toBe("read");
    expect(searchLoopDirective([step(["scan_attachments"])])).toBe("read");
    expect(searchLoopDirective([step(["document_outline"])])).toBe("read");
    expect(searchLoopDirective([step(["extract_numeric_series"])])).toBe(
      "read"
    );
  });

  it("does not treat divider-only cover sheets as a cited page", () => {
    expect(
      searchLoopDirective([
        {
          toolCalls: [{ toolName: "search_documents" }],
          toolResults: [
            {
              toolName: "search_documents",
              output: {
                returnedCount: 2,
                dividerHits: 2,
                keepSearchOpen: true,
                results: [{ pageNumber: 32, divider: true }],
              },
            },
          ],
        },
      ])
    ).toBe("continue");
  });

  it("does not treat a title list without identifiers as a cited page", () => {
    expect(
      searchLoopDirective([
        {
          toolCalls: [{ toolName: "search_documents" }],
          toolResults: [
            {
              toolName: "search_documents",
              output: {
                returnedCount: 1,
                identityIncompleteHits: 1,
                keepSearchOpen: true,
                results: [
                  {
                    pageNumber: 49,
                    identityIncomplete: true,
                    quote:
                      "Standard operating procedure for operation & cleaning",
                  },
                ],
              },
            },
          ],
        },
      ])
    ).toBe("continue");
  });

  it("does not treat a TOC-only ID laundry list as a cited page", () => {
    expect(
      searchLoopDirective([
        {
          toolCalls: [{ toolName: "search_documents" }],
          toolResults: [
            {
              toolName: "search_documents",
              output: {
                returnedCount: 3,
                requirementIndexHits: 3,
                results: [
                  { pageNumber: 12 },
                  { pageNumber: 84 },
                  { pageNumber: 217 },
                ],
              },
            },
          ],
        },
      ])
    ).toBe("continue");
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

  it("keeps search open after a split-table cited page", () => {
    expect(
      searchLoopDirective([
        {
          toolCalls: [{ toolName: "search_documents" }],
          toolResults: [
            {
              toolName: "search_documents",
              output: {
                returnedCount: 1,
                continuationHits: 1,
                keepSearchOpen: true,
                results: [
                  {
                    pageNumber: 23,
                    continues: true,
                    nextPage: 24,
                    quote: "Annexure-I Page 23 of 24",
                  },
                ],
              },
            },
          ],
        },
      ])
    ).toBe("continue");
  });

  it("keeps search open after a split-table page read that sets keepSearchOpen", () => {
    expect(
      searchLoopDirective([
        {
          toolCalls: [{ toolName: "read_document_page" }],
          toolResults: [
            {
              toolName: "read_document_page",
              output: {
                status: "found",
                nextPage: 24,
                keepSearchOpen: true,
              },
            },
          ],
        },
      ])
    ).toBe("continue");
  });

  it("keeps search open after unsupported_facts so the model can grep again", () => {
    expect(
      searchLoopDirective([
        {
          toolCalls: [{ toolName: "draft_field" }],
          toolResults: [
            {
              toolName: "draft_field",
              output: {
                status: "unsupported_facts",
                keepSearchOpen: true,
                unsupported: [{ text: "MF-25-VIAL-01", kind: "identifier" }],
              },
            },
          ],
        },
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

describe("withoutAskUserTool", () => {
  it("drops ask_user from an activeTools list", () => {
    expect(
      withoutAskUserTool(["read_section", "search_documents", "ask_user"])
    ).toEqual(["read_section", "search_documents"]);
  });
});

describe("documentAskUserDirective", () => {
  it("hides ask_user after a grep until a page is read", () => {
    expect(documentAskUserDirective([step(["search_documents"], 3)])).toBe(
      "hide"
    );
    expect(
      documentAskUserDirective([
        step(["search_documents"], 3),
        step(["read_document_page"]),
      ])
    ).toBe("continue");
  });

  it("does not hide ask_user before any grep", () => {
    expect(documentAskUserDirective([step(["read_section"])])).toBe("continue");
  });
});
