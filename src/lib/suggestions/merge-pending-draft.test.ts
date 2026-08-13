import { describe, expect, it } from "vitest";
import {
  applyTargetedEditToPending,
  planPendingDraftMerge,
  PENDING_MERGE_MIN_SIMILARITY,
} from "./merge-pending-draft";
import { wordSimilarity } from "./word-diff";

const PARA_1 =
  "This Design Verification Report (DVR) details the verification activities conducted for the Solea® All-Tissue Dental Laser system [DV Requriements Convergent Dental.pdf, p. 1]. The objective of this activity is to demonstrate that the system design outputs successfully meet the established design inputs, including system-level functional requirements, laser performance specifications, and packaging requirements defined in [DV Requriements Convergent Dental.pdf].";

const PARA_2 =
  "This verification is performed in support of [Design Change Reference], ensuring compliance with specified performance characteristics such as pulse energy, repetition rate, and beam accuracy, as well as maintaining safety and integrity post-transportation.";

const PARA_1_WITH_CO2 =
  "This Design Verification Report (DVR) details the verification activities conducted for the Solea® All-Tissue Dental Laser system (a 9.3 μm CO₂ laser) [DV Requriements Convergent Dental.pdf, p. 1]. The objective of this activity is to demonstrate that the system design outputs successfully meet the established design inputs, including system-level functional requirements, laser performance specifications, and packaging requirements defined in [DV Requriements Convergent Dental.pdf].";

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

describe("planPendingDraftMerge", () => {
  it("revision of an open two-block draft updates those cards instead of stacking copies", () => {
    // Live incident: purpose_scope on dvr cnvrgt, 2026-08-13. First draft_field
    // emitted two insert cards; a follow-up "include the 9.3 μm CO₂ spec"
    // re-drafted the whole field and stacked two more inserts.
    expect(wordSimilarity(PARA_1, PARA_1_WITH_CO2)).toBeGreaterThan(
      PENDING_MERGE_MIN_SIMILARITY
    );
    expect(wordSimilarity(PARA_1, PARA_2)).toBeLessThan(PENDING_MERGE_MIN_SIMILARITY);

    const plan = planPendingDraftMerge({
      proposedMarkdown: `${PARA_1_WITH_CO2}\n\n${PARA_2}`,
      pending: [blockInsert("card-1", PARA_1), blockInsert("card-2", PARA_2)],
    });

    expect(plan).not.toBeNull();
    expect(plan!.dismissIds).toEqual([]);
    expect(plan!.slots).toEqual([
      {
        kind: "update",
        id: "card-1",
        markdown: PARA_1_WITH_CO2,
        unchanged: false,
      },
      { kind: "update", id: "card-2", markdown: PARA_2, unchanged: true },
    ]);
  });

  it("adds a genuinely new block as a new card and leaves the others in place", () => {
    const extra = "Packaging verification covers drop, vibration, and temperature cycling.";
    const plan = planPendingDraftMerge({
      proposedMarkdown: `${PARA_1}\n\n${PARA_2}\n\n${extra}`,
      pending: [blockInsert("card-1", PARA_1), blockInsert("card-2", PARA_2)],
    });
    expect(plan!.slots).toEqual([
      { kind: "update", id: "card-1", markdown: PARA_1, unchanged: true },
      { kind: "update", id: "card-2", markdown: PARA_2, unchanged: true },
      { kind: "create", markdown: extra },
    ]);
    expect(plan!.dismissIds).toEqual([]);
  });

  it("does not keep two cards that repeat the same information", () => {
    const plan = planPendingDraftMerge({
      proposedMarkdown: `${PARA_1_WITH_CO2}\n\n${PARA_1_WITH_CO2}`,
      pending: [blockInsert("card-1", PARA_1), blockInsert("card-2", PARA_2)],
    });
    expect(plan!.slots).toHaveLength(1);
    expect(plan!.slots[0]).toMatchObject({
      kind: "update",
      markdown: PARA_1_WITH_CO2,
    });
    expect(plan!.dismissIds).toContain("card-2");
  });

  it("returns null when there is nothing open, so the caller diffs a fresh draft", () => {
    expect(
      planPendingDraftMerge({ proposedMarkdown: PARA_1, pending: [] })
    ).toBeNull();
  });

  it("returns null when the new draft does not overlap open cards", () => {
    const plan = planPendingDraftMerge({
      proposedMarkdown: "Completely unrelated packaging protocol narrative.",
      pending: [blockInsert("card-1", PARA_1), blockInsert("card-2", PARA_2)],
    });
    expect(plan).toBeNull();
  });
});

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
