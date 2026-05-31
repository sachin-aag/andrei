import { describe, expect, it } from "vitest";
import {
  canSuggestFixes,
  gapCriteriaForSection,
  sortGapCriteria,
  sortedOpenSuggestionsForSection,
} from "@/lib/ai/suggestion-gating";
import type { CommentRecord, EvaluationRecord } from "@/types/report";

const baseEval = (overrides: Partial<EvaluationRecord>): EvaluationRecord => ({
  id: "eval-1",
  reportId: "r1",
  sectionId: "sec-define",
  section: "define",
  criterionKey: "define.datetime",
  criterionLabel: "Date/time",
  status: "not_met",
  reasoning: "Missing time",
  bypassed: false,
  evaluatedContentHash: "abc",
  updatedAt: "",
  ...overrides,
});

const baseComment = (overrides: Partial<CommentRecord>): CommentRecord => ({
  id: "fix-1",
  reportId: "r1",
  parentId: null,
  sectionId: "sec-define",
  section: "define",
  authorId: "ai",
  content: '{"insertText":"x","deleteText":"","reasoning":""}',
  anchorText: "",
  contentPath: "narrative",
  fromPos: 0,
  toPos: 1,
  status: "open",
  kind: "ai_fix",
  evaluationId: "eval-1",
  createdAt: "2026-01-01T00:00:00Z",
  ...overrides,
  source: overrides.source ?? "app",
  externalAuthorName: overrides.externalAuthorName ?? null,
  externalAuthorInitials: overrides.externalAuthorInitials ?? null,
  externalCommentId: overrides.externalCommentId ?? null,
  externalCreatedAt: overrides.externalCreatedAt ?? null,
  locked: overrides.locked ?? false,
});

describe("suggestion-gating", () => {
  it("gap criteria excludes rows with open ai_fix", () => {
    const evaluations = [baseEval({})];
    const comments = [baseComment({})];
    const gap = gapCriteriaForSection("define", evaluations, comments, {
      narrative: { type: "doc", content: [] },
    });
    expect(gap).toHaveLength(0);
  });

  it("can suggest when failing criterion has no open fix", () => {
    const evaluations = [
      baseEval({
        id: "eval-1",
        criterionKey: "define.datetime",
        evaluatedContentHash: "",
      }),
      baseEval({
        id: "eval-2",
        criterionKey: "define.location",
        status: "not_met",
        evaluatedContentHash: "",
      }),
    ];
    const comments = [baseComment({ evaluationId: "eval-1" })];
    const content = { narrative: { type: "doc", content: [] } };
    expect(canSuggestFixes("define", evaluations, comments, content)).toBe(true);
    const gap = gapCriteriaForSection("define", evaluations, comments, content);
    expect(gap.map((g) => g.criterionKey)).toEqual(["define.location"]);
  });

  it("includes partially_met criteria in the gap set", () => {
    const evaluations = [
      baseEval({
        id: "eval-met",
        criterionKey: "define.what_happened",
        status: "met",
        evaluatedContentHash: "",
      }),
      baseEval({
        id: "eval-partial",
        criterionKey: "define.location",
        status: "partially_met",
        evaluatedContentHash: "",
      }),
    ];
    const content = { narrative: { type: "doc", content: [] } };
    const gap = gapCriteriaForSection("define", evaluations, [], content);
    expect(gap.map((g) => g.criterionKey)).toEqual(["define.location"]);
    expect(canSuggestFixes("define", evaluations, [], content)).toBe(true);
  });

  it("sorts gap criteria not_met before partially_met", () => {
    const evaluations = [
      baseEval({
        id: "eval-yellow",
        criterionKey: "define.location",
        status: "partially_met",
        evaluatedContentHash: "",
      }),
      baseEval({
        id: "eval-red",
        criterionKey: "define.datetime",
        status: "not_met",
        evaluatedContentHash: "",
      }),
    ];
    const content = { narrative: { type: "doc", content: [] } };
    const gap = gapCriteriaForSection("define", evaluations, [], content);
    expect(gap.map((g) => g.criterionKey)).toEqual([
      "define.datetime",
      "define.location",
    ]);
    const reordered = sortGapCriteria("define", [...gap].reverse());
    expect(reordered.map((g) => g.criterionKey)).toEqual([
      "define.datetime",
      "define.location",
    ]);
  });

  it("excludes placeholder-only failing criteria from the gap set", () => {
    const evaluations = [
      baseEval({
        id: "eval-placeholder",
        criterionKey: "improve.capa_tracking",
        status: "partially_met",
        reasoning:
          "CAPA fields are present as placeholders; complete them in the Placeholders panel.",
        evaluatedContentHash: "",
      }),
      baseEval({
        id: "eval-real",
        criterionKey: "define.datetime",
        status: "not_met",
        reasoning: "Detection date and time are not distinguished.",
        evaluatedContentHash: "",
      }),
    ];
    const content = { narrative: { type: "doc", content: [] } };
    const gap = gapCriteriaForSection("define", evaluations, [], content);
    expect(gap.map((g) => g.criterionKey)).toEqual(["define.datetime"]);
  });

  it("sorts open suggestions red before yellow", () => {
    const evaluations = [
      baseEval({
        id: "e-yellow",
        criterionKey: "define.location",
        status: "partially_met",
      }),
      baseEval({ id: "e-red", criterionKey: "define.datetime", status: "not_met" }),
    ];
    const comments = [
      baseComment({ id: "c-yellow", evaluationId: "e-yellow", createdAt: "2026-01-02" }),
      baseComment({ id: "c-red", evaluationId: "e-red", createdAt: "2026-01-03" }),
    ];
    const sorted = sortedOpenSuggestionsForSection("define", comments, evaluations);
    expect(sorted.map((c) => c.id)).toEqual(["c-red", "c-yellow"]);
  });
});
