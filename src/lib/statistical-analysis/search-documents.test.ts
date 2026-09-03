import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildKeywordTsQuery } from "@/lib/attachments/retrieval";
import {
  ANALYTICS_SEARCH_CLOSED_MESSAGE,
  ANALYTICS_SEARCH_COVERAGE_HINT,
  buildAnalyticsSearchDocumentsTool,
  partitionAnalyticsSearchHits,
  resolveAnalyticsSearchMode,
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
      parse: (value: unknown) => Record<string, unknown>;
    };
    expect(schema.parse({ query: "Conductivity" }).mode).toBe("keyword");
    const oversized = schema.parse({
      limit: 20,
      queries: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
      mode: "keyword",
    }) as unknown as { limit: number; queries: string[] };
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
      message: ANALYTICS_SEARCH_CLOSED_MESSAGE,
      returnedCount: 0,
      results: [],
    });
    expect(ANALYTICS_SEARCH_CLOSED_MESSAGE).toContain("do not ask_user");
  });

  it("ranks a data-sheet snippet ahead of a requirement-ID laundry list", () => {
    const indexQuote =
      "M3-SYS-FN-037 M3-SYS-FN-039 M3-SYS-FN-041 M3-SYS-FN-044 M3-SYS-FN-046";
    const { content, index } = partitionAnalyticsSearchHits([
      { quote: indexQuote, text: indexQuote },
      {
        quote: "M3-SYS-FN-037 mist volume 5.2 mL/min at the nozzle",
        text: "M3-SYS-FN-037 mist volume 5.2 mL/min at the nozzle",
      },
    ]);
    expect(content).toHaveLength(1);
    expect(index).toHaveLength(1);
    expect(content[0]?.quote).toContain("mist volume");
  });

  it("retries excluding TOC pages when the first grep is only ID lists", async () => {
    const indexQuote =
      "M3-SYS-FN-037 M3-SYS-FN-039 M3-SYS-FN-041 M3-SYS-FN-044 M3-SYS-FN-046";
    searchReportDocuments
      .mockResolvedValueOnce([
        {
          citationId: "toc-12",
          attachmentId: "att_1",
          filename: "mech.pdf",
          pageNumber: 12,
          quote: indexQuote,
          text: indexQuote,
          chunkId: "ch-12",
          sourceKind: "pdf",
          ingestRunId: "run",
          description: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          citationId: "data-88",
          attachmentId: "att_1",
          filename: "mech.pdf",
          pageNumber: 88,
          quote: "M3-SYS-FN-037 mist volume 5.2 mL/min",
          text: "M3-SYS-FN-037 mist volume 5.2 mL/min",
          chunkId: "ch-88",
          sourceKind: "pdf",
          ingestRunId: "run",
          description: null,
        },
      ]);
    const tool = buildAnalyticsSearchDocumentsTool({ reportId: "report-1" });
    const execute = tool.execute;
    if (!execute) throw new Error("search_documents has no execute");
    const result = (await execute(
      { query: "M3-SYS-FN-037", limit: 8, mode: "keyword" },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    )) as {
      returnedCount: number;
      requirementIndexHits: number;
      results: Array<{ pageNumber: number; requirementIndex?: boolean }>;
    };
    expect(searchReportDocuments).toHaveBeenCalledTimes(2);
    expect(searchReportDocuments.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        excludePages: [{ attachmentId: "att_1", pageNumber: 12 }],
      })
    );
    expect(result).toMatchObject({
      returnedCount: 1,
      requirementIndexHits: 0,
    });
    expect(result.results[0]).toMatchObject({
      pageNumber: 88,
      citation: "[mech.pdf, p. 88]",
    });
    expect(result.results[0]).not.toHaveProperty("requirementIndex");
  });

  it("tags leftover TOC hits when a mixed grep has both kinds", async () => {
    const indexQuote =
      "M3-SYS-FN-037 M3-SYS-FN-039 M3-SYS-FN-041 M3-SYS-FN-044 M3-SYS-FN-046";
    searchReportDocuments.mockResolvedValue([
      {
        citationId: "toc-12",
        attachmentId: "att_1",
        filename: "mech.pdf",
        pageNumber: 12,
        quote: indexQuote,
        text: indexQuote,
        chunkId: "ch-12",
        sourceKind: "pdf",
        ingestRunId: "run",
        description: null,
      },
      {
        citationId: "data-88",
        attachmentId: "att_1",
        filename: "mech.pdf",
        pageNumber: 88,
        quote: "M3-SYS-FN-037 mist volume 5.2 mL/min",
        text: "M3-SYS-FN-037 mist volume 5.2 mL/min",
        chunkId: "ch-88",
        sourceKind: "pdf",
        ingestRunId: "run",
        description: null,
      },
    ]);
    const tool = buildAnalyticsSearchDocumentsTool({ reportId: "report-1" });
    const execute = tool.execute;
    if (!execute) throw new Error("search_documents has no execute");
    const result = (await execute(
      { query: "M3-SYS-FN-037", limit: 8, mode: "keyword" },
      {
        toolCallId: "test",
        messages: [],
        abortSignal: new AbortController().signal,
      }
    )) as {
      returnedCount: number;
      requirementIndexHits: number;
      results: Array<{ pageNumber: number; requirementIndex?: boolean }>;
    };
    expect(searchReportDocuments).toHaveBeenCalledTimes(1);
    expect(result.results.map((hit) => hit.pageNumber)).toEqual([88, 12]);
    expect(result.results[0]).not.toHaveProperty("requirementIndex");
    expect(result.results[0]).toMatchObject({
      citation: "[mech.pdf, p. 88]",
    });
    expect(result.results[1]).toMatchObject({
      pageNumber: 12,
      requirementIndex: true,
      citation: "[mech.pdf, p. 12]",
    });
    expect(result).toMatchObject({ requirementIndexHits: 1, returnedCount: 2 });
  });
});
