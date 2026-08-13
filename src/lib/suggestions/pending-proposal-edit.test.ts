import { describe, expect, it } from "vitest";
import { applyTargetedEditToPending } from "./pending-proposal-edit";

const PARA_1 =
  "This Design Verification Report (DVR) details the verification activities conducted for the Solea® All-Tissue Dental Laser system [DV Requriements Convergent Dental.pdf, p. 1]. The objective of this activity is to demonstrate that the system design outputs successfully meet the established design inputs, including system-level functional requirements, laser performance specifications, and packaging requirements defined in [DV Requriements Convergent Dental.pdf].";

const PARA_2 =
  "This verification is performed in support of [Design Change Reference], ensuring compliance with specified performance characteristics such as pulse energy, repetition rate, and beam accuracy, as well as maintaining safety and integrity post-transportation.";

function blockInsert(id: string, markdown: string, createdAt = "2026-08-13T21:14:30.000Z") {
  return {
    id,
    kind: "ai_fix",
    createdAt,
    content: JSON.stringify({
      deleteText: "",
      insertText: "",
      reasoning: "Drafting Purpose & Scope",
      label: markdown.slice(0, 40),
      draft: { id: "draft-1", index: 1, total: 2 },
      blockEdit: {
        op: "insert",
        anchor: "",
        blockIndex: -1,
        proposedMarkdown: markdown,
      },
    }),
  };
}

describe("applyTargetedEditToPending", () => {
  it("applies a follow-up phrase to the one open card that contains the anchor", () => {
    const result = applyTargetedEditToPending({
      pending: [blockInsert("card-1", PARA_1), blockInsert("card-2", PARA_2)],
      edit: {
        anchorText: "Solea® All-Tissue Dental Laser system",
        deleteText: "Solea® All-Tissue Dental Laser system",
        insertText: "Solea® All-Tissue Dental Laser system (a 9.3 μm CO₂ laser)",
      },
    });
    expect(result?.id).toBe("card-1");
    expect(result?.nextMarkdown).toContain("9.3 μm CO₂ laser");
    expect(result?.nextMarkdown).not.toContain("Design Change Reference");
  });

  it("does not guess when the anchor hits more than one card", () => {
    const result = applyTargetedEditToPending({
      pending: [
        blockInsert("a", "The Solea system was verified."),
        blockInsert("b", "The Solea system was packaged."),
      ],
      edit: {
        anchorText: "The Solea system",
        deleteText: "The Solea system",
        insertText: "The Solea 9.3 μm system",
      },
    });
    expect(result).toBeNull();
  });
});
