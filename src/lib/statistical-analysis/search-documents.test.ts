import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildKeywordTsQuery } from "@/lib/attachments/retrieval";
import {
  ANALYTICS_SEARCH_COVERAGE_HINT,
  resolveAnalyticsSearchMode,
  buildAnalyticsSearchDocumentsTool,
} from "./search-documents";

vi.mock("@/db", () => ({ db: {} }));

const searchReportDocuments = vi.hoisted(() => vi.fn());

vi.mock("@/lib/attachments/retrieval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/attachments/retrieval")>();
  return {
    ...actual,
    searchReportDocuments: (...args: unknown[]) =>
      searchReportDocuments(...(args as [])),
  };
});

describe("resolveAnalyticsSearchMode", () => {
  it("defaults to keyword when the query has lexical tokens", () => {
    expect(buildKeywordTsQuery("Conductivity")).not.toBeNull();
    expect(resolveAnalyticsSearchMode("Conductivity")).toEqual({
      mode: "keyword",
      keywordFallback: false,
    });
  });

  it("falls back to hybrid when keyword would be empty", () => {
    expect(buildKeywordTsQuery("???")).toBeNull();
    expect(resolveAnalyticsSearchMode("???")).toEqual({
      mode: "hybrid",
      keywordFallback: true,
    });
  });

  it("honors an explicit hybrid request", () => {
    expect(resolveAnalyticsSearchMode("Conductivity", "hybrid")).toEqual({
      mode: "hybrid",
      keywordFallback: false,
    });
  });
});

describe("buildAnalyticsSearchDocumentsTool", () => {
  beforeEach(() => {
    searchReportDocuments.mockReset();
  });

  it("defaults mode to keyword and does not tell the model to keep grepping", async () => {
    searchReportDocuments.mockResolvedValue([
      {
        citationId: "c1",
        attachmentId: "att_1",
        filename: "p1.pdf",
        pageNumber: 2,
      },
    ]);
    const tool = buildAnalyticsSearchDocumentsTool({ reportId: "report-1" });
    const schema = tool.inputSchema as unknown as {
      parse: (value: unknown) => { mode: string };
    };
    expect(schema.parse({ query: "Conductivity" }).mode).toBe("keyword");
    const oversized = schema.parse({
      limit: 20,
      queries: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
      mode: "keyword",
    }) as { limit: number; queries: string[] };
    expect(oversized.limit).toBe(16);
    expect(oversized.queries).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(tool.description).not.toContain("truncated=true means keep grepping");
    expect(tool.description).toContain("At most two calls");

    const execute = tool.execute;
    if (!execute) throw new Error("search_documents has no execute");
    const result = await execute(
      { query: "Conductivity", limit: 8, mode: "keyword" },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(searchReportDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: "report-1",
        query: "Conductivity",
        mode: "keyword",
      })
    );
    expect(result).toMatchObject({
      mode: "keyword",
      requestedMode: "keyword",
      keywordFallback: false,
      returnedCount: 1,
      coverageHint: ANALYTICS_SEARCH_COVERAGE_HINT,
    });
    expect(ANALYTICS_SEARCH_COVERAGE_HINT).not.toContain(
      "If truncated=true, grep again"
    );
  });

  it("falls back to hybrid when the query has no lexical tokens", async () => {
    searchReportDocuments.mockResolvedValue([]);
    const tool = buildAnalyticsSearchDocumentsTool({ reportId: "report-1" });
    const execute = tool.execute;
    if (!execute) throw new Error("search_documents has no execute");
    const result = await execute(
      { query: "???", limit: 8, mode: "keyword" },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(searchReportDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "hybrid", query: "???" })
    );
    expect(result).toMatchObject({
      mode: "hybrid",
      requestedMode: "keyword",
      keywordFallback: true,
    });
  });

  it("refuses further greps when the search gate is closed", async () => {
    const tool = buildAnalyticsSearchDocumentsTool({
      reportId: "report-1",
      searchGate: { closed: true },
    });
    const execute = tool.execute;
    if (!execute) throw new Error("search_documents has no execute");
    const result = await execute(
      { query: "Conductivity", limit: 8, mode: "keyword" },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );
    expect(searchReportDocuments).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "search_closed",
      returnedCount: 0,
      results: [],
    });
  });
});
