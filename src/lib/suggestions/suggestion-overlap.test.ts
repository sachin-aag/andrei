import { describe, expect, it } from "vitest";
import type { CommentRecord } from "@/types/report";
import {
  partitionBulkApplies,
  suggestionApplySpansOverlap,
  spanForSuggestionComment,
} from "./suggestion-overlap";

function comment(
  id: string,
  deleteText: string,
  insertText: string,
  anchor: string
): CommentRecord {
  return {
    id,
    reportId: "report-1",
    parentId: null,
    sectionId: "s1",
    section: "define",
    authorId: "ai",
    content: JSON.stringify({
      deleteText,
      insertText,
      reasoning: "seed",
    }),
    anchorText: anchor,
    contentPath: "narrative",
    fromPos: null,
    toPos: null,
    status: "open",
    kind: "ai_fix",
    source: "ai",
    externalAuthorName: null,
    externalAuthorInitials: null,
    externalCommentId: null,
    externalCreatedAt: null,
    locked: false,
    evaluationId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const sectionContent = {
  narrative: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "On 01/01/2026 a deviation was observed. The result exceeded limits.",
          },
        ],
      },
    ],
  },
};

const independentA = comment(
  "c1",
  "",
  " (shift A)",
  "On 01/01/2026"
);
const independentB = comment(
  "c2",
  "",
  " by 12%",
  "The result exceeded limits"
);
const overlappingA = comment(
  "o1",
  "deviation was observed",
  "issue was seen",
  "a deviation was observed"
);
const overlappingB = comment(
  "o2",
  "was observed. The result",
  "was logged. The result",
  "was observed. The result"
);

describe("suggestionApplySpansOverlap", () => {
  it("treats disjoint inserts in the same field as independent", () => {
    const a = spanForSuggestionComment({
      section: "define",
      comment: independentA,
      sectionContent,
    });
    const b = spanForSuggestionComment({
      section: "define",
      comment: independentB,
      sectionContent,
    });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(suggestionApplySpansOverlap(a!, b!)).toBe(false);
  });

  it("detects overlapping deletes in the same field", () => {
    const a = spanForSuggestionComment({
      section: "define",
      comment: overlappingA,
      sectionContent,
    });
    const b = spanForSuggestionComment({
      section: "define",
      comment: overlappingB,
      sectionContent,
    });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(suggestionApplySpansOverlap(a!, b!)).toBe(true);
  });
});

describe("partitionBulkApplies", () => {
  it("batches non-overlapping locatable comments and clusters overlaps", () => {
    const partition = partitionBulkApplies({
      section: "define",
      comments: [independentA, overlappingA, independentB, overlappingB],
      sectionContent,
    });

    expect(partition.independent.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(partition.overlapping.map((group) => group.map((c) => c.id))).toEqual([
      ["o1", "o2"],
    ]);
    expect(partition.unlocatableIds).toEqual([]);
  });

  it("puts unlocatable comments aside instead of clustering them", () => {
    const stale = comment("s1", "missing", "x", "this text is not in the document");
    const partition = partitionBulkApplies({
      section: "define",
      comments: [independentA, stale],
      sectionContent,
    });

    expect(partition.independent.map((c) => c.id)).toEqual(["c1"]);
    expect(partition.overlapping).toEqual([]);
    expect(partition.unlocatableIds).toEqual(["s1"]);
  });
});
