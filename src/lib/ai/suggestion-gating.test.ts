import { describe, expect, it } from "vitest";
import {
  canSuggestFixes,
  gapCriteriaForSection,
  parseAiFixCommentContent,
  parseBlockEdit,
  sectionContentHash,
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

describe("parseBlockEdit", () => {
  it("accepts insertRow / deleteRow with table locators", () => {
    expect(
      parseBlockEdit({
        op: "insertRow",
        anchor: "Action Due PA-01",
        blockIndex: 0,
        tableIndex: 0,
        rowIndex: 1,
        rowAnchor: "PA-01",
        proposedMarkdown: "| Action | Due |\n| --- | --- |\n| PA-03 | 15/06/2026 |",
      })
    ).toMatchObject({
      op: "insertRow",
      tableIndex: 0,
      rowIndex: 1,
      rowAnchor: "PA-01",
    });
    expect(
      parseBlockEdit({
        op: "deleteRow",
        anchor: "Action Due PA-02",
        blockIndex: 0,
        tableIndex: 0,
        rowIndex: 2,
        rowAnchor: "PA-02",
      })
    ).toMatchObject({ op: "deleteRow", rowAnchor: "PA-02" });
    expect(
      parseBlockEdit({
        op: "replace",
        anchor: "Old para.",
        blockIndex: 0,
        blockCount: 2,
        proposedMarkdown: "### New\n\nBody.",
      })
    ).toMatchObject({ op: "replace", blockCount: 2 });
  });

  it("rejects unknown ops and round-trips through ai_fix JSON", () => {
    expect(parseBlockEdit({ op: "merge", anchor: "x", blockIndex: 0 })).toBeUndefined();
    const parsed = parseAiFixCommentContent(
      JSON.stringify({
        deleteText: "",
        insertText: "",
        reasoning: "Add a row.",
        blockEdit: {
          op: "insertRow",
          anchor: "table",
          blockIndex: 0,
          tableIndex: 0,
          rowIndex: 1,
          rowAnchor: "PA-01",
          proposedMarkdown: "| A | B |\n| --- | --- |\n| 1 | 2 |",
        },
      })
    );
    expect(parsed.blockEdit).toMatchObject({
      op: "insertRow",
      tableIndex: 0,
      rowAnchor: "PA-01",
    });
  });
});
