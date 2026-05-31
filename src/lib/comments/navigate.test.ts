import { describe, expect, it } from "vitest";
import { gutterAnchorIdForComment } from "@/lib/comments/navigate";
import type { CommentRecord } from "@/types/report";

function comment(partial: Partial<CommentRecord>): CommentRecord {
  const base: CommentRecord = {
    id: "c1",
    reportId: "r1",
    authorId: "u1",
    parentId: null,
    sectionId: null,
    section: "control",
    contentPath: "preventiveActions",
    fromPos: null,
    toPos: null,
    content: "test",
    anchorText: "test",
    status: "open",
    kind: "human",
    source: "local",
    externalAuthorName: null,
    externalAuthorInitials: null,
    externalCommentId: null,
    externalCreatedAt: null,
    locked: false,
    evaluationId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  return {
    ...base,
    ...partial,
    sectionId: partial.sectionId ?? null,
    anchorText: partial.anchorText ?? base.anchorText,
    source: partial.source ?? base.source,
  };
}

describe("gutterAnchorIdForComment", () => {
  it("uses field prefix for section field comments without editor positions", () => {
    expect(gutterAnchorIdForComment(comment({}))).toBe("field:c1");
  });

  it("uses comment id for editor-anchored comments", () => {
    expect(
      gutterAnchorIdForComment(
        comment({ fromPos: 1, toPos: 5, contentPath: "narrative" })
      )
    ).toBe("c1");
  });

  it("uses unanchored prefix when section has no content path", () => {
    expect(
      gutterAnchorIdForComment(
        comment({ contentPath: null, fromPos: null, toPos: null })
      )
    ).toBe("unanchored:c1");
  });
});
