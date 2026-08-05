import { describe, expect, it, vi } from "vitest";
import { reciprocalRankFusion, verifyCitation } from "@/lib/attachments/retrieval";

const limitMock = vi.fn(async () => []);
const builder = {
  from: vi.fn(() => builder),
  innerJoin: vi.fn(() => builder),
  where: vi.fn(() => builder),
  limit: limitMock,
};

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => builder),
  },
}));

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
