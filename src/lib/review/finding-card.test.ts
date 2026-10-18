import { describe, expect, it } from "vitest";
import { serializeAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import { reviewFindingCardModel } from "./finding-card";
import { withReleasedToQueue } from "./proposed-edit";
import type { ReviewFindingDto } from "./ui";

function finding(overrides: Partial<ReviewFindingDto> = {}): ReviewFindingDto {
  return {
    id: "f1",
    checkId: "report.criteria.measure",
    section: "measure",
    contentPath: "narrative",
    anchorText: "acceptable to the R&D Engineer",
    message:
      'Subjective acceptance criterion: TM-02 passes if readings are "acceptable to the R&D Engineer".',
    severity: "critical",
    kind: "fixable",
    commentId: "c1",
    status: "open",
    metadata: { criterionKey: "TM-02" },
    ...overrides,
  };
}

const singleSpanContent = serializeAiFixCommentContent({
  deleteText: "acceptable to the R&D Engineer",
  insertText: "Measured force within ±5 g of the applied reference load",
  reasoning: "Set the limit before testing.",
});

describe("reviewFindingCardModel", () => {
  it("builds a held single-span card: replacement, Apply, exact highlight", () => {
    const card = reviewFindingCardModel({
      finding: finding(),
      check: { label: "Measure criteria" },
      sectionLabel: "Acceptance Criteria",
      sectionNumber: 7,
      criterionLabel: "Subjective acceptance criterion",
      comment: {
        id: "c1",
        status: "open",
        kind: "ai_grammar",
        anchorText: 'readings are "acceptable to the R&D Engineer"',
        contentPath: "narrative",
        content: singleSpanContent,
      },
    });

    expect(card.location).toBe("§7 TM-02 · Acceptance Criteria");
    expect(card.kicker).toBeNull();
    expect(card.title).toBe("Subjective acceptance criterion");
    expect(card.body).toContain("acceptable to the R&D Engineer");
    expect(card.suggestion).toEqual({
      kind: "replacement",
      deleteText: "acceptable to the R&D Engineer",
      insertText: "Measured force within ±5 g of the applied reference load",
    });
    expect(card.primary).toBe("apply");
    expect(card.locate).toEqual({
      section: "measure",
      contentPath: "narrative",
      anchor: 'readings are "acceptable to the R&D Engineer"',
      needle: "acceptable to the R&D Engineer",
    });
  });

  it("offers View tracked change once the suggestion is already in the document", () => {
    const released = reviewFindingCardModel({
      finding: finding(),
      check: null,
      sectionLabel: "Measure",
      sectionNumber: 2,
      criterionLabel: null,
      comment: {
        id: "c1",
        status: "open",
        kind: "ai_fix",
        anchorText: "acceptable to the R&D Engineer",
        contentPath: "narrative",
        content: withReleasedToQueue(singleSpanContent, true),
      },
    });
    expect(released.primary).toBe("view");

    const fromCriteria = reviewFindingCardModel({
      finding: finding(),
      check: null,
      sectionLabel: "Measure",
      sectionNumber: 2,
      criterionLabel: null,
      comment: {
        id: "c1",
        status: "open",
        kind: "ai_fix",
        anchorText: "acceptable to the R&D Engineer",
        contentPath: "narrative",
        content: singleSpanContent,
        evaluationId: "e1",
      },
    });
    expect(fromCriteria.primary).toBe("view");
  });

  it("keeps Apply on a multi-part suggestion and highlights the whole field", () => {
    const card = reviewFindingCardModel({
      finding: finding(),
      check: { label: "Citation supports claim" },
      sectionLabel: "Measure",
      sectionNumber: 2,
      criterionLabel: null,
      comment: {
        id: "c1",
        status: "open",
        kind: "ai_fix",
        anchorText: "the batch failed",
        contentPath: "narrative",
        content: serializeAiFixCommentContent({
          deleteText: "the batch failed",
          insertText: "the batch failed [1]",
          reasoning: "Add the source.",
          second: {
            anchorText: "Citations",
            deleteText: "",
            insertText: "[protocol.pdf, p. 4]",
          },
        }),
      },
    });

    expect(card.suggestion).toEqual({ kind: "multi_part" });
    expect(card.primary).toBe("apply");
    expect(card.locate).toEqual({
      section: "measure",
      contentPath: "narrative",
      anchor: "",
      needle: "",
    });
    expect(card.kicker).toBe("Citation supports claim");
  });

  it("asks for review when there is no automatic fix and paints the repeated token in its context", () => {
    const card = reviewFindingCardModel({
      finding: finding({
        checkId: "citations.resolves",
        kind: "needs_human",
        commentId: null,
        anchorText: "the batch failed [1]",
        message: "[1] has no matching line in the Citations list.",
        metadata: { focusText: "[1]" },
      }),
      check: { label: "Citations resolve" },
      sectionLabel: "Measure",
      sectionNumber: 2,
      criterionLabel: null,
      comment: null,
    });

    expect(card.suggestion).toEqual({ kind: "manual", suggestedText: null });
    expect(card.primary).toBe("verify");
    expect(card.locate).toEqual({
      section: "measure",
      contentPath: "narrative",
      anchor: "the batch failed [1]",
      needle: "[1]",
    });
  });

  it("shows unmatched grammar wording as a manual suggestion", () => {
    const card = reviewFindingCardModel({
      finding: finding({
        checkId: "writing.grammar",
        kind: "needs_human",
        commentId: null,
        anchorText: "Pre-requisites",
        message: "Standardize spelling.",
        metadata: { focusText: "Pre-requisites", suggestedText: "Prerequisites" },
      }),
      check: { label: "Grammar & spelling" },
      sectionLabel: "Pre-requisites",
      sectionNumber: 6,
      criterionLabel: null,
      comment: null,
    });
    expect(card.suggestion).toEqual({
      kind: "manual",
      suggestedText: "Prerequisites",
    });
    expect(card.primary).toBe("verify");
  });

  it("drafts on apply for a criterion and highlights the section without a quote", () => {
    const card = reviewFindingCardModel({
      finding: finding({
        kind: "needs_human",
        commentId: null,
        contentPath: null,
        anchorText: "",
        metadata: { criterionKey: "TM-02", evaluationId: "e1" },
      }),
      check: { label: "Measure criteria" },
      sectionLabel: "Acceptance Criteria",
      sectionNumber: 7,
      criterionLabel: "Subjective acceptance criterion",
      comment: null,
    });
    expect(card.suggestion).toEqual({ kind: "draft_on_apply" });
    expect(card.primary).toBe("apply");
    expect(card.locate).toEqual({
      section: "measure",
      contentPath: null,
      anchor: "",
      needle: "",
    });
  });

  it("shows a stored proposed replacement before a comment exists", () => {
    const card = reviewFindingCardModel({
      finding: finding({
        checkId: "writing.grammar",
        kind: "fixable",
        commentId: null,
        anchorText: "Analyze samples as per BN100",
        metadata: {
          proposedEdit: {
            kind: "ai_grammar",
            anchorText: "Analyze samples as per BN100",
            deleteText: "BN100",
            insertText: "BN-100",
          },
        },
      }),
      check: { label: "Grammar & spelling" },
      sectionLabel: "Define",
      sectionNumber: 1,
      criterionLabel: null,
      comment: null,
    });
    expect(card.primary).toBe("apply");
    expect(card.suggestion).toEqual({
      kind: "replacement",
      deleteText: "BN100",
      insertText: "BN-100",
    });
    expect(card.locate).toMatchObject({
      anchor: "Analyze samples as per BN100",
      needle: "BN100",
    });
  });

  it("ignores a closed comment and falls back to the finding", () => {
    const card = reviewFindingCardModel({
      finding: finding({ kind: "needs_human", metadata: {} }),
      check: null,
      sectionLabel: "Measure",
      sectionNumber: 2,
      criterionLabel: null,
      comment: {
        id: "c1",
        status: "resolved",
        kind: "ai_fix",
        anchorText: "acceptable to the R&D Engineer",
        contentPath: "narrative",
        content: singleSpanContent,
      },
    });
    expect(card.primary).toBe("verify");
  });

  it("has nothing to locate when the finding is not tied to a section", () => {
    const card = reviewFindingCardModel({
      finding: finding({
        section: null,
        contentPath: null,
        anchorText: "",
        kind: "needs_human",
        commentId: null,
        metadata: {},
      }),
      check: { label: "Citation supports claim" },
      sectionLabel: null,
      sectionNumber: null,
      criterionLabel: null,
      comment: null,
    });
    expect(card.locate).toBeNull();
  });
});
