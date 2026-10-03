import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { liveCriteriaFindings } from "@/lib/review/snapshot";
import type { CommentRecord, EvaluationRecord } from "@/types/report";

function evaluation(
  overrides: Partial<EvaluationRecord> & Pick<EvaluationRecord, "id" | "status">
): EvaluationRecord {
  return {
    reportId: "r1",
    sectionId: "s1",
    section: "define",
    criterionKey: "define.problem",
    criterionLabel: "Problem statement",
    reasoning: "Missing batch number.",
    bypassed: false,
    evaluatedContentHash: "h",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function comment(
  overrides: Partial<CommentRecord> & Pick<CommentRecord, "id">
): CommentRecord {
  return {
    reportId: "r1",
    parentId: null,
    sectionId: "s1",
    section: "define",
    authorId: "ai",
    content: "{}",
    anchorText: "the deviation",
    contentPath: "narrative",
    fromPos: null,
    toPos: null,
    status: "open",
    kind: "ai_fix",
    source: "andrei",
    externalAuthorName: null,
    externalAuthorInitials: null,
    externalCommentId: null,
    externalCreatedAt: null,
    locked: false,
    evaluationId: "eval-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("liveCriteriaFindings", () => {
  it("links a failing criterion to its open ai_fix comment", () => {
    const findings = liveCriteriaFindings({
      checkId: "report.criteria.define",
      section: "define",
      evaluations: [evaluation({ id: "eval-1", status: "not_met" })],
      comments: [comment({ id: "c1", evaluationId: "eval-1" })],
    });
    expect(findings).toEqual([
      expect.objectContaining({
        id: "live:eval-1",
        kind: "fixable",
        commentId: "c1",
        contentPath: "narrative",
        severity: "error",
      }),
    ]);
  });

  it("stays needs-human when no open suggestion exists", () => {
    const findings = liveCriteriaFindings({
      checkId: "report.criteria.define",
      section: "define",
      evaluations: [evaluation({ id: "eval-2", status: "partially_met" })],
      comments: [],
    });
    expect(findings[0]).toMatchObject({
      kind: "needs_human",
      commentId: null,
      severity: "warning",
    });
  });
});
