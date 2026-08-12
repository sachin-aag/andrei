import { describe, expect, it } from "vitest";
import type { CommentRecord, EvaluationRecord } from "@/types/report";
import { serializeAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import { markdownToDoc } from "@/lib/tiptap/markdown-to-doc";
import {
  sortedOpenSuggestionsInDocumentOrder,
  suggestionDocumentOffset,
} from "@/lib/suggestions/suggestion-order";

const NARRATIVE = markdownToDoc(
  "First paragraph mentions alpha.\n\nSecond paragraph mentions beta.\n\nThird paragraph mentions gamma."
);
const SECTION_CONTENT = { narrative: NARRATIVE };

function fix(opts: {
  id: string;
  deleteText: string;
  insertText: string;
  createdAt: string;
  evaluationId?: string | null;
}): CommentRecord {
  return {
    id: opts.id,
    reportId: "r1",
    parentId: null,
    sectionId: "s1",
    section: "define",
    authorId: "ai",
    content: serializeAiFixCommentContent({
      deleteText: opts.deleteText,
      insertText: opts.insertText,
      reasoning: "drafted",
    }),
    anchorText: "",
    contentPath: "narrative",
    fromPos: null,
    toPos: null,
    status: "open",
    kind: "ai_fix",
    source: "app",
    externalAuthorName: null,
    externalAuthorInitials: null,
    externalCommentId: null,
    externalCreatedAt: null,
    locked: false,
    evaluationId: opts.evaluationId ?? null,
    createdAt: opts.createdAt,
  };
}

describe("suggestionDocumentOffset", () => {
  it("orders by position in the field, not insert time", () => {
    const third = fix({
      id: "c",
      deleteText: "gamma",
      insertText: "GAMMA",
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    const first = fix({
      id: "a",
      deleteText: "alpha",
      insertText: "ALPHA",
      createdAt: "2026-01-01T00:00:03.000Z",
    });
    expect(
      suggestionDocumentOffset("define", first, SECTION_CONTENT)
    ).toBeLessThan(suggestionDocumentOffset("define", third, SECTION_CONTENT));
  });

  it("sorts an unlocatable suggestion last rather than throwing", () => {
    const missing = fix({
      id: "x",
      deleteText: "text that is not in the field",
      insertText: "y",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(suggestionDocumentOffset("define", missing, SECTION_CONTENT)).toBe(
      Number.MAX_SAFE_INTEGER
    );
  });
});

describe("sortedOpenSuggestionsInDocumentOrder", () => {
  const evaluations: EvaluationRecord[] = [];

  it("walks a drafted section top to bottom regardless of insert order", () => {
    const comments = [
      fix({ id: "c", deleteText: "gamma", insertText: "G", createdAt: "2026-01-01T00:00:01.000Z" }),
      fix({ id: "a", deleteText: "alpha", insertText: "A", createdAt: "2026-01-01T00:00:02.000Z" }),
      fix({ id: "b", deleteText: "beta", insertText: "B", createdAt: "2026-01-01T00:00:03.000Z" }),
    ];
    const sorted = sortedOpenSuggestionsInDocumentOrder(
      "define",
      comments,
      evaluations,
      SECTION_CONTENT
    );
    expect(sorted.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("falls back to the base ordering with no section content", () => {
    const comments = [
      fix({ id: "c", deleteText: "gamma", insertText: "G", createdAt: "2026-01-01T00:00:01.000Z" }),
      fix({ id: "a", deleteText: "alpha", insertText: "A", createdAt: "2026-01-01T00:00:02.000Z" }),
    ];
    const sorted = sortedOpenSuggestionsInDocumentOrder("define", comments, evaluations);
    expect(sorted.map((c) => c.id)).toEqual(["c", "a"]);
  });

  it("keeps criterion-linked suggestions ahead of chat-drafted ones", () => {
    const linked = fix({
      id: "linked",
      deleteText: "gamma",
      insertText: "G",
      createdAt: "2026-01-01T00:00:09.000Z",
      evaluationId: "eval-1",
    });
    const chat = fix({
      id: "chat",
      deleteText: "alpha",
      insertText: "A",
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    const evals: EvaluationRecord[] = [
      {
        id: "eval-1",
        reportId: "r1",
        sectionId: "s1",
        section: "define",
        criterionKey: "k",
        criterionLabel: "K",
        status: "not_met",
        reasoning: "",
        bypassed: false,
        evaluatedContentHash: "",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const sorted = sortedOpenSuggestionsInDocumentOrder(
      "define",
      [chat, linked],
      evals,
      SECTION_CONTENT
    );
    expect(sorted.map((c) => c.id)).toEqual(["linked", "chat"]);
  });
});
