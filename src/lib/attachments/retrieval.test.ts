import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildKeywordTsQuery,
  buildMatchCenteredSnippet,
  buildOutlineFromStoredPages,
  normalizeAttachmentIdFilter,
  reciprocalRankFusion,
  searchReportDocuments,
  searchReportDocumentsDetailed,
  searchReportDocumentsMany,
  verifyCitation,
} from "@/lib/attachments/retrieval";

const limitMock = vi.fn(async () => [] as unknown[]);
const orderByMock = vi.fn(() => builder);
const builder = {
  from: vi.fn(() => builder),
  innerJoin: vi.fn(() => builder),
  where: vi.fn(() => builder),
  orderBy: orderByMock,
  limit: limitMock,
};

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => builder),
  },
}));

const embedMock = vi.fn(async () => ({
  embedding: Array.from({ length: 768 }, () => 0.01),
}));
const embedManyMock = vi.fn(async (opts: unknown) => {
  const values = (opts as { values?: string[] }).values ?? [];
  return {
    embeddings: values.map(() => Array.from({ length: 768 }, () => 0.01)),
  };
});

vi.mock("ai", () => ({
  embed: (...args: unknown[]) => embedMock(...(args as [])),
  embedMany: (opts: unknown) => embedManyMock(opts),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => ({ embedding: () => ({ id: "stub-embedding" }) }),
}));

function chunkRow(chunkId: string, attachmentId: string, pageNumber = 1) {
  return {
    attachmentId,
    filename: `${attachmentId}.pdf`,
    description: null,
    pageNumber,
    chunkId,
    sourceKind: "transcript",
    rawText: `raw ${chunkId}`,
    contextualText: `contextual ${chunkId}`,
    ingestRunId: "run-1",
    sourceSha256: "sha",
  };
}

describe("reciprocalRankFusion", () => {
  it("merges vector and keyword rankings by reciprocal rank", () => {
    const results = reciprocalRankFusion(
      [
        {
          name: "vector",
          rows: [
            { chunkId: "a", text: "vector first" },
            { chunkId: "b", text: "vector second" },
          ],
        },
        {
          name: "keyword",
          rows: [
            { chunkId: "b", text: "keyword first" },
            { chunkId: "c", text: "keyword second" },
          ],
        },
      ],
      { k: 60, limit: 3 }
    );

    expect(results.map((r) => r.chunkId)).toEqual(["b", "a", "c"]);
    expect(results[0].vectorRank).toBe(2);
    expect(results[0].keywordRank).toBe(1);
    expect(results[0].rrfScore).toBeGreaterThan(results[1].rrfScore);
  });

  it("still ranks a single populated arm when the other list is empty", () => {
    const results = reciprocalRankFusion(
      [
        {
          name: "vector",
          rows: [
            { chunkId: "a", text: "vector only" },
            { chunkId: "b", text: "vector second" },
          ],
        },
        { name: "keyword", rows: [] },
      ],
      { k: 60, limit: 2 }
    );

    expect(results.map((r) => r.chunkId)).toEqual(["a", "b"]);
    expect(results[0].vectorRank).toBe(1);
    expect(results[0].keywordRank).toBeUndefined();
  });
});

describe("normalizeAttachmentIdFilter", () => {
  it("dedupes and drops blanks so an empty filter means 'no filter'", () => {
    expect(normalizeAttachmentIdFilter(["a", "a", " ", "", "b"])).toEqual(["a", "b"]);
    expect(normalizeAttachmentIdFilter(undefined)).toEqual([]);
    expect(normalizeAttachmentIdFilter(["  "])).toEqual([]);
  });
});

describe("buildKeywordTsQuery", () => {
  it("joins a multi-word natural-language query with OR", () => {
    expect(
      buildKeywordTsQuery("what was the sterilization cycle for autoclave AC-12")
    ).toBe(
      "what or was or the or sterilization or cycle or for or autoclave or AC-12"
    );
  });

  it("skips punctuation-only input so the keyword arm is not queried", () => {
    expect(buildKeywordTsQuery("???")).toBeNull();
    expect(buildKeywordTsQuery("...")).toBeNull();
    expect(buildKeywordTsQuery("")).toBeNull();
  });
});

describe("searchReportDocuments with tagged attachments", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    vi.stubEnv("GOOGLE_VERTEX_PROJECT", "");
    limitMock.mockReset();
    limitMock.mockResolvedValue([]);
    embedMock.mockClear();
    embedManyMock.mockClear();
  });

  it("does not label results when no attachments are tagged", async () => {
    limitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([chunkRow("c1", "att_1")])
      .mockResolvedValueOnce([]);

    const results = await searchReportDocuments({
      reportId: "report-1",
      query: "dissolution failure",
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.pinned).toBeUndefined();
    // lexical + vector + keyword; no backfill pass for an unrestricted search.
    expect(limitMock).toHaveBeenCalledTimes(3);
  });

  it("marks tagged hits and skips backfill when they fill the limit", async () => {
    limitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        chunkRow("c1", "att_1", 1),
        chunkRow("c2", "att_1", 2),
      ])
      .mockResolvedValueOnce([]);

    const results = await searchReportDocuments({
      reportId: "report-1",
      query: "dissolution failure",
      limit: 2,
      attachmentIds: ["att_1"],
    });

    expect(results.map((r) => r.pinned)).toEqual([true, true]);
    expect(limitMock).toHaveBeenCalledTimes(3);
  });

  it("backfills from the rest of the report when tagged hits fall short", async () => {
    limitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([chunkRow("c1", "att_1")])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([chunkRow("c9", "att_other")])
      .mockResolvedValueOnce([]);

    const results = await searchReportDocuments({
      reportId: "report-1",
      query: "dissolution failure",
      limit: 3,
      attachmentIds: ["att_1"],
    });

    expect(results.map((r) => r.chunkId)).toEqual(["c1", "c9"]);
    expect(results.map((r) => r.pinned)).toEqual([true, false]);
    // Tagged lexical + fused + backfill lexical + fused; query embedded once.
    expect(limitMock).toHaveBeenCalledTimes(6);
    expect(embedMock).toHaveBeenCalledTimes(1);
  });

  it("does not backfill when explicit tags define the attachment scope", async () => {
    limitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([chunkRow("c1", "att_1")])
      .mockResolvedValueOnce([]);

    const results = await searchReportDocuments({
      reportId: "report-1",
      query: "dissolution failure",
      limit: 3,
      attachmentIds: ["att_1"],
      backfill: false,
    });

    expect(results.map((r) => r.chunkId)).toEqual(["c1"]);
    expect(results.map((r) => r.pinned)).toEqual([true]);
    expect(limitMock).toHaveBeenCalledTimes(3);
  });

  it("skips retrieval entirely for a blank query", async () => {
    const results = await searchReportDocuments({
      reportId: "report-1",
      query: "   ",
      attachmentIds: ["att_1"],
    });

    expect(results).toEqual([]);
    expect(embedMock).not.toHaveBeenCalled();
  });

  it("skips the keyword arm for punctuation-only queries", async () => {
    limitMock.mockResolvedValueOnce([chunkRow("c1", "att_1")]);

    const results = await searchReportDocuments({
      reportId: "report-1",
      query: "???",
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(limitMock).toHaveBeenCalledTimes(1);
  });

  it("skips embeddings for keyword-only grep", async () => {
    limitMock.mockResolvedValueOnce([chunkRow("c1", "att_1", 32)]);

    const results = await searchReportDocuments({
      reportId: "report-1",
      query: "UUT Solea",
      limit: 5,
      mode: "keyword",
    });

    expect(results).toHaveLength(1);
    expect(embedMock).not.toHaveBeenCalled();
    expect(limitMock).toHaveBeenCalledTimes(1);
  });

  it("drops already-seen pages so later grep rounds can move on", async () => {
    limitMock
      .mockResolvedValueOnce([
        chunkRow("c34", "att_1", 34),
        chunkRow("c32", "att_1", 32),
      ])
      .mockResolvedValueOnce([]);

    const results = await searchReportDocuments({
      reportId: "report-1",
      query: "UUT data sheet",
      limit: 5,
      excludePages: [{ attachmentId: "att_1", pageNumber: 34 }],
    });

    expect(results.map((r) => r.pageNumber)).toEqual([32]);
  });

  it("collapses to the best-matching chunk per page when the query is lexical", async () => {
    limitMock
      .mockResolvedValueOnce([
        {
          ...chunkRow("c2", "att_1", 121),
          contextualText: "Table 3 Required Testing Equipment Logic Analyzer Saleae",
          rawText: "Table 3 Required Testing Equipment Logic Analyzer Saleae",
        },
      ])
      .mockResolvedValueOnce([
        {
          ...chunkRow("c1", "att_1", 121),
          contextualText: "TOP-00051 UUT header boilerplate",
          rawText: "TOP-00051 UUT header boilerplate",
        },
        {
          ...chunkRow("c2", "att_1", 121),
          contextualText: "Table 3 Required Testing Equipment Logic Analyzer Saleae",
          rawText: "Table 3 Required Testing Equipment Logic Analyzer Saleae",
        },
        chunkRow("c3", "att_1", 122),
      ])
      .mockResolvedValueOnce([]);

    const results = await searchReportDocuments({
      reportId: "report-1",
      query: "logic analyzer",
      limit: 5,
    });

    expect(results.map((r) => r.chunkId)).toEqual(["c2", "c3"]);
    expect(results[0]!.text).toContain("Logic Analyzer");
    expect(results[0]!.text).toContain("Saleae");
    expect(embedMock).toHaveBeenCalledTimes(1);
    expect(limitMock).toHaveBeenCalledTimes(3);
  });

  it("skips the query embedding when lexical hits alone fill the limit", async () => {
    limitMock.mockResolvedValueOnce([
      {
        ...chunkRow("c2", "att_1", 121),
        contextualText: "Table 3 Required Testing Equipment Logic Analyzer Saleae",
        rawText: "Table 3 Required Testing Equipment Logic Analyzer Saleae",
      },
    ]);

    const { results, timing } = await searchReportDocumentsDetailed({
      reportId: "report-1",
      query: "logic analyzer",
      limit: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.text).toContain("Logic Analyzer");
    expect(timing.skippedEmbedding).toBe(true);
    expect(embedMock).not.toHaveBeenCalled();
    expect(limitMock).toHaveBeenCalledTimes(1);
  });

  it("returns the quote transcript instead of a visual-interpretation summary", async () => {
    limitMock.mockResolvedValueOnce([
      {
        ...chunkRow("visual", "att_1", 3),
        sourceKind: "visual_interpretation",
        rawText:
          "this page lists which instruments appear on the executed equipment data table",
        contextualText:
          "Document: att_1.pdf | Page 3 | executed log\n\nthis page lists which instruments appear on the executed equipment data table",
      },
      {
        ...chunkRow("quote", "att_1", 3),
        sourceKind: "quote",
        rawText:
          "EXECUTED Equipment Data Table Torque Wrench Sturtevant Digital Calipers",
        contextualText:
          "Document: att_1.pdf | Page 3 | executed log\n\nEXECUTED Equipment Data Table Torque Wrench Sturtevant Digital Calipers",
      },
    ]);

    const results = await searchReportDocuments({
      reportId: "report-1",
      query: "which instruments appear on the executed equipment data table",
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe("quote");
    expect(results[0]!.text).toContain("Digital Calipers");
    expect(results[0]!.text).not.toMatch(/this page lists which instruments/i);
  });

  it("ranks an explicit page locator ahead of earlier pages of the same file", async () => {
    limitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
      {
        ...chunkRow("p1", "att_1", 1),
        filename: "dv-protocol-equipment.pdf",
        rawText: "UUT HEADER page one boilerplate",
        contextualText:
          "Document: dv-protocol-equipment.pdf | Page 1 | header\n\nUUT HEADER page one boilerplate",
      },
      {
        ...chunkRow("p2", "att_1", 2),
        filename: "dv-protocol-equipment.pdf",
        rawText: `${"UUT HEADER repeating boilerplate ".repeat(40)}Required Testing Equipment Narda SRM-3006`,
        contextualText:
          "Document: dv-protocol-equipment.pdf | Page 2 | required\n\nRequired Testing Equipment Narda SRM-3006",
      },
    ]);

    const results = await searchReportDocuments({
      reportId: "report-1",
      query: "dv-protocol-equipment.pdf page 2",
      limit: 5,
    });

    expect(results.map((row) => row.pageNumber)).toEqual([2, 1]);
    expect(results[0]!.text).toContain("Required Testing Equipment");
  });

  it("skips the query embedding when exact identifier hits fill the limit", async () => {
    limitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([chunkRow("c31", "att_1", 31)]);

    const { results, timing } = await searchReportDocumentsDetailed({
      reportId: "report-1",
      query: "SW-LWB-4",
      limit: 1,
    });

    expect(results.map((r) => r.pageNumber)).toEqual([31]);
    expect(timing.skippedEmbedding).toBe(true);
    expect(timing.queryKind).toBe("identifier");
    expect(embedMock).not.toHaveBeenCalled();
    expect(limitMock).toHaveBeenCalledTimes(3);
  });

  it("restricts an identifier query to the file whose summary mentions the id", async () => {
    limitMock
      .mockResolvedValueOnce([
        {
          attachmentId: "att_sw",
          filename: "software-requirements.pdf",
          documentSummary: "Includes SW-EVAL-7 laser interlock.",
        },
        {
          attachmentId: "att_dv",
          filename: "dv-protocol-equipment.pdf",
          documentSummary: "Required testing equipment.",
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          ...chunkRow("hit", "att_sw", 2),
          filename: "software-requirements.pdf",
          rawText: "SW-EVAL-7 Laser interlock latency Pass",
          contextualText: "SW-EVAL-7 Laser interlock latency Pass",
        },
      ]);

    const { results, timing } = await searchReportDocumentsDetailed({
      reportId: "report-1",
      query: "SW-EVAL-7",
      limit: 1,
    });

    expect(results.map((row) => row.attachmentId)).toEqual(["att_sw"]);
    expect(timing.skippedEmbedding).toBe(true);
    expect(embedMock).not.toHaveBeenCalled();
    expect(limitMock).toHaveBeenCalledTimes(3);
  });

  it("reranks an identifier mention ahead of a lexical-only page", async () => {
    limitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          ...chunkRow("noise", "att_1", 1),
          filename: "other.pdf",
          rawText: "unrelated equipment table header",
          contextualText: "unrelated equipment table header",
        },
        {
          ...chunkRow("hit", "att_1", 2),
          filename: "software-requirements.pdf",
          rawText: "SW-EVAL-7 Laser interlock latency Pass",
          contextualText: "SW-EVAL-7 Laser interlock latency Pass",
        },
      ]);

    const results = await searchReportDocuments({
      reportId: "report-1",
      query: "SW-EVAL-7",
      limit: 2,
    });

    expect(results.map((row) => row.chunkId)).toEqual(["hit", "noise"]);
  });

  it("embeds unique semantic queries once via embedMany", async () => {
    const arms = await searchReportDocumentsMany({
      reportId: "report-1",
      queries: ["dissolution failure", "root cause analysis"],
      limit: 5,
    });

    expect(arms).toHaveLength(2);
    expect(embedManyMock).toHaveBeenCalledTimes(1);
    expect(embedMock).not.toHaveBeenCalled();
    const batched = embedManyMock.mock.calls[0]?.[0] as { values: string[] };
    expect(batched.values).toEqual(["dissolution failure", "root cause analysis"]);
  });
});

describe("buildMatchCenteredSnippet export", () => {
  it("is re-exported from retrieval for callers that build tool excerpts", () => {
    const snippet = buildMatchCenteredSnippet(
      "aaa ".repeat(40) + "Logic Analyzer Saleae",
      "logic analyzer",
      80
    );
    expect(snippet).toContain("Logic Analyzer");
  });
});

describe("buildOutlineFromStoredPages", () => {
  it("repairs blank and page-index contexts from existing OCR transcripts", () => {
    const outline = buildOutlineFromStoredPages([
      {
        pageNumber: 31,
        printedPageLabel: "31",
        pageContext: "",
        transcript:
          "CONVERGENT DENTAL\nTABLE 4 SOFTWARE REQUIREMENTS\nSW-LWB-4 Laser wavelength bandwidth Pass",
      },
      {
        pageNumber: 32,
        printedPageLabel: "32",
        pageContext: "Page 32",
        transcript: "TABLE 4 SOFTWARE REQUIREMENTS\nSW-LCB-1 Laser control board Pass",
      },
    ]);
    expect(outline.pages[0]?.pageContext).toContain("SW-LWB-4");
    expect(outline.pages[1]?.pageContext).toContain("SW-LCB-1");
    expect(outline.spans[0]).toMatchObject({
      title: "TABLE 4 SOFTWARE REQUIREMENTS",
      pageStart: 31,
      pageEnd: 32,
    });
  });
});

describe("verifyCitation", () => {
  it("rejects invented canonical citation IDs that do not match an active chunk", async () => {
    limitMock.mockResolvedValueOnce([]);

    await expect(
      verifyCitation("report-1", "att:attachment-1:p:3:c:invented-chunk")
    ).resolves.toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects malformed citation IDs before touching storage", async () => {
    await expect(verifyCitation("report-1", "not-a-citation")).resolves.toEqual({
      ok: false,
      reason: "invalid_format",
    });
  });
});
