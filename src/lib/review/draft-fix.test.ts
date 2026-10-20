import { describe, expect, it } from "vitest";
import {
  buildDraftFixPrompt,
  claimAround,
  stubDraftEdit,
  type ReviewFindingToDraft,
} from "./draft-fix";

const fieldText =
  "Batch BN-99 failed on 12 Jan 2024 [1]. The line was cleared on 14 Jan 2024 [1].";

function finding(overrides: Partial<ReviewFindingToDraft> = {}): ReviewFindingToDraft {
  return {
    checkId: "citations.uncited",
    section: "define",
    contentPath: "narrative",
    anchorText: "failed on 12 Jan 2024",
    message: "Uncited date: “12 Jan 2024”.",
    severity: "major",
    metadata: { focusText: "12 Jan 2024" },
    ...overrides,
  };
}

describe("draft fix helpers", () => {
  it("searches with the sentence around the target, not just the token", () => {
    const claim = claimAround(fieldText, finding());
    expect(claim).toContain("Batch BN-99 failed on 12 Jan 2024");
  });

  it("uses the occurrence index when the token repeats", () => {
    const claim = claimAround(
      "Hold [1]. Release [1].",
      finding({ anchorText: "[1]", metadata: { focusText: "[1]", focusOccurrence: 1 } })
    );
    expect(claim).toContain("Release");
  });

  it("puts the finding, target, wording hint, field and evidence in the prompt", () => {
    const prompt = buildDraftFixPrompt({
      finding: finding({
        metadata: { focusText: "12 Jan 2024", suggestedText: "12 January 2024" },
      }),
      fieldText,
      evidence: [{ filename: "batch.pdf", pageNumber: 3, text: "Failed 12 Jan 2024" }],
    });
    expect(prompt).toContain("FINDING (citations.uncited)");
    expect(prompt).toContain("TARGET TEXT: 12 Jan 2024");
    expect(prompt).toContain("SUGGESTED WORDING: 12 January 2024");
    expect(prompt).toContain(`FIELD:\n${fieldText}`);
    expect(prompt).toContain("[batch.pdf, p. 3]\nFailed 12 Jan 2024");
  });

  it("says so when there is no evidence", () => {
    const prompt = buildDraftFixPrompt({ finding: finding(), fieldText, evidence: [] });
    expect(prompt).toContain("EVIDENCE: none");
  });

  it("stubs a placeholder edit inside the unique anchor", () => {
    expect(stubDraftEdit(fieldText, finding())).toEqual({
      anchorText: "failed on 12 Jan 2024",
      deleteText: "12 Jan 2024",
      insertText: "12 Jan 2024 <verify>",
    });
    expect(stubDraftEdit("other text", finding())).toBeNull();
  });
});
