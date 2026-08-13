import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildKeywordTsQuery,
  normalizeAttachmentIdFilter,
  reciprocalRankFusion,
  searchReportDocuments,
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

vi.mock("ai", () => ({
  embed: (...args: unknown[]) => embedMock(...(args as [])),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => ({ embedding: () => ({ id: "stub-embedding" }) }),
}));

function chunkRow(chunkId: string, attachmentId: string) {
  return {
    attachmentId,
    filename: `${attachmentId}.pdf`,
    description: null,
    pageNumber: 1,
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
  });

  it("does not label results when no attachments are tagged", async () => {
    limitMock
      .mockResolvedValueOnce([chunkRow("c1", "att_1")])
      .mockResolvedValueOnce([]);

    const results = await searchReportDocuments({
      reportId: "report-1",
      query: "dissolution failure",
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.pinned).toBeUndefined();
    // vector + keyword only: no backfill pass for an unrestricted search.
    expect(limitMock).toHaveBeenCalledTimes(2);
  });

  it("marks tagged hits and skips backfill when they fill the limit", async () => {
    limitMock
      .mockResolvedValueOnce([chunkRow("c1", "att_1"), chunkRow("c2", "att_1")])
      .mockResolvedValueOnce([]);

    const results = await searchReportDocuments({
      reportId: "report-1",
      query: "dissolution failure",
      limit: 2,
      attachmentIds: ["att_1"],
    });

    expect(results.map((r) => r.pinned)).toEqual([true, true]);
    expect(limitMock).toHaveBeenCalledTimes(2);
  });

  it("backfills from the rest of the report when tagged hits fall short", async () => {
    limitMock
      .mockResolvedValueOnce([chunkRow("c1", "att_1")])
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
    // Tagged pass + backfill pass, but the query is embedded only once.
    expect(limitMock).toHaveBeenCalledTimes(4);
    expect(embedMock).toHaveBeenCalledTimes(1);
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
