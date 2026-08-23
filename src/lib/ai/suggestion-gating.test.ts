import { describe, expect, it } from "vitest";
import {
  canSuggestFixes,
  gapCriteriaForSection,
  nextOpenSuggestionAfterResolve,
  parseAiFixCommentContent,
  sectionContentHash,
  serializeAiFixCommentContent,
  sortGapCriteria,
  sortedOpenSuggestionsForSection,
} from "@/lib/ai/suggestion-gating";
import { evaluationContentHash } from "@/lib/ai/evaluation-content-hash";
import { getCriteria, getDocumentType } from "@/lib/document-types";
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

  it("prefers the rest of the same-section queue over a later section", () => {
    const evaluations = [
      baseEval({ id: "e-define-2", criterionKey: "define.location" }),
      baseEval({
        id: "e-measure",
        section: "measure",
        criterionKey: "measure.data",
      }),
    ];
    const comments = [
      baseComment({ id: "c-define-1", evaluationId: "e-define-2" }),
      baseComment({
        id: "c-define-2",
        evaluationId: "e-define-2",
        createdAt: "2026-01-02T00:00:00Z",
      }),
      baseComment({
        id: "c-measure",
        section: "measure",
        evaluationId: "e-measure",
      }),
    ];
    expect(
      nextOpenSuggestionAfterResolve("c-define-1", "define", comments, evaluations, [
        "define",
        "measure",
        "analyze",
      ])?.id
    ).toBe("c-define-2");
  });

  it("hands off to the next section when this section's queue is empty", () => {
    const evaluations = [
      baseEval({
        id: "e-measure",
        section: "measure",
        criterionKey: "measure.data",
      }),
    ];
    const comments = [
      baseComment({ id: "c-define" }),
      baseComment({
        id: "c-measure",
        section: "measure",
        evaluationId: "e-measure",
      }),
    ];
    expect(
      nextOpenSuggestionAfterResolve("c-define", "define", comments, evaluations, [
        "define",
        "measure",
        "analyze",
      ])?.id
    ).toBe("c-measure");
  });

  it("wraps to an earlier section when nothing is left later in the document", () => {
    const evaluations = [
      baseEval({ id: "e-define" }),
      baseEval({
        id: "e-measure",
        section: "measure",
        criterionKey: "measure.data",
      }),
    ];
    const comments = [
      baseComment({ id: "c-define", evaluationId: "e-define" }),
      baseComment({
        id: "c-measure",
        section: "measure",
        evaluationId: "e-measure",
      }),
    ];
    expect(
      nextOpenSuggestionAfterResolve("c-measure", "measure", comments, evaluations, [
        "define",
        "measure",
        "analyze",
      ])?.id
    ).toBe("c-define");
  });

  it("returns null when the resolved card was the last open suggestion", () => {
    expect(
      nextOpenSuggestionAfterResolve(
        "c-only",
        "define",
        [baseComment({ id: "c-only" })],
        [baseEval({})],
        ["define", "measure"]
      )
    ).toBeNull();
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

  it("matches evaluationContentHash so fresh failing criteria enable Suggest fixes", () => {
    const content = {
      narrative: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Purpose" }] }],
      },
    };
    const documentType = "design_verification" as const;
    const section = "purpose_scope" as const;
    const allSections = { purpose_scope: content };
    const hash = evaluationContentHash({
      section,
      content,
      allSections,
      criteria: getCriteria(documentType, section),
      promptVersion: getDocumentType(documentType).prompts.promptVersion,
    });
    expect(
      sectionContentHash(section, content, { documentType, allSections })
    ).toBe(hash);

    const evaluations = [
      baseEval({
        id: "dv-fail",
        section,
        sectionId: "sec-purpose",
        criterionKey: "purpose.objective",
        status: "not_met",
        evaluatedContentHash: hash,
      }),
    ];
    expect(
      canSuggestFixes(section, evaluations, [], content, {
        documentType,
        allSections,
      })
    ).toBe(true);
  });

  it("includes dependsOn sections in the freshness hash for DV results", () => {
    const resultsContent = {
      results_table: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Pass" }] }],
      },
    };
    const traceability = {
      matrix: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "REQ-1" }] }],
      },
    };
    const allSections = {
      test_results: resultsContent,
      traceability,
    };
    const documentType = "design_verification" as const;
    const hash = sectionContentHash("test_results", resultsContent, {
      documentType,
      allSections,
    });
    const evaluations = [
      baseEval({
        id: "dv-results",
        section: "test_results",
        sectionId: "sec-results",
        criterionKey: "results.traceable_ids",
        status: "not_met",
        evaluatedContentHash: hash,
      }),
    ];
    expect(
      canSuggestFixes("test_results", evaluations, [], resultsContent, {
        documentType,
        allSections,
      })
    ).toBe(true);
    expect(
      canSuggestFixes("test_results", evaluations, [], resultsContent, {
        documentType,
        allSections: { test_results: resultsContent },
      })
    ).toBe(false);
  });
});

describe("parseAiFixCommentContent second", () => {
  it("round-trips a split citation part", () => {
    const json = serializeAiFixCommentContent({
      deleteText: "",
      insertText: " at 9.8 W",
      reasoning: "Adds the measured value",
      second: {
        anchorText: "",
        deleteText: "",
        insertText: "[protocol.pdf, p. 3]",
      },
    });
    expect(parseAiFixCommentContent(json).second).toEqual({
      anchorText: "",
      deleteText: "",
      insertText: "[protocol.pdf, p. 3]",
    });
  });

  it("drops an empty second part", () => {
    const json = serializeAiFixCommentContent({
      deleteText: "",
      insertText: " at 9.8 W",
      reasoning: "",
      second: { anchorText: "", deleteText: "", insertText: "   " },
    });
    expect(parseAiFixCommentContent(json).second).toBeUndefined();
  });
});
