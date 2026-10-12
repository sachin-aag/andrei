import { describe, expect, it } from "vitest";
import { serializeAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import { reviewFindingCardModel } from "./finding-card";
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

describe("reviewFindingCardModel", () => {
  it("builds a single-span card with a location line and replacement", () => {
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
        anchorText: "acceptable to the R&D Engineer",
        contentPath: "narrative",
        content: serializeAiFixCommentContent({
          deleteText: "acceptable to the R&D Engineer",
          insertText: "Measured force within ±5 g of the applied reference load",
          reasoning: "Set the limit before testing.",
        }),
      },
    });

    expect(card.location).toBe("§7 TM-02 · Acceptance Criteria");
    expect(card.kicker).toBeNull();
    expect(card.title).toBe("Subjective acceptance criterion");
    expect(card.body).toContain("acceptable to the R&D Engineer");
    expect(card.replacement).toBe(
      "Measured force within ±5 g of the applied reference load"
    );
    expect(card.locate).toEqual({
      section: "measure",
      contentPath: "narrative",
      needle: "acceptable to the R&D Engineer",
    });
    expect(card.applyCommentId).toBe("c1");
  });

  it("hides show and apply when the suggestion covers a second span", () => {
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

    expect(card.locate).toBeNull();
    expect(card.applyCommentId).toBeNull();
    expect(card.replacement).toBeNull();
    expect(card.kicker).toBe("Citation supports claim");
  });

  it("can highlight an anchor that has no suggestion yet", () => {
    const card = reviewFindingCardModel({
      finding: finding({
        kind: "needs_human",
        commentId: null,
        message: "The limit is still subjective.",
        metadata: {},
      }),
      check: { label: "Grammar & spelling" },
      sectionLabel: "Measure",
      sectionNumber: 2,
      criterionLabel: null,
      comment: null,
    });

    expect(card.locate?.needle).toBe("acceptable to the R&D Engineer");
    expect(card.applyCommentId).toBeNull();
    expect(card.replacement).toBeNull();
    expect(card.title).toBe("The limit is still subjective.");
    expect(card.kicker).toBe("Grammar & spelling");
  });
});
