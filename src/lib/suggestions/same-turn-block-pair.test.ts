import { describe, expect, it } from "vitest";
import type { CommentRecord } from "@/types/report";
import {
  createSameTurnBlockPairing,
  findOpenBlockPair,
  isAppendBlock,
  isAppendLeadIn,
  recordBlock,
  recordLeadIn,
  sortCommentsForPairedApply,
  takeUnusedBlock,
  takeUnusedLeadIn,
  takeUnusedLeadInMatchingAnchor,
} from "@/lib/suggestions/same-turn-block-pair";

function comment(
  id: string,
  content: Record<string, unknown>,
  extras?: Partial<CommentRecord>
): CommentRecord {
  return {
    id,
    reportId: "report-1",
    parentId: null,
    sectionId: "s1",
    section: "purpose",
    authorId: "ai",
    content: JSON.stringify(content),
    anchorText: "",
    contentPath: "narrative",
    fromPos: null,
    toPos: null,
    status: "open",
    kind: "ai_fix",
    source: "ai",
    externalAuthorName: null,
    externalAuthorInitials: null,
    externalCommentId: null,
    externalCreatedAt: null,
    locked: false,
    evaluationId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...extras,
  };
}

describe("isAppendLeadIn / isAppendBlock", () => {
  it("treats empty-anchor prose as a lead-in", () => {
    expect(
      isAppendLeadIn({
        anchorText: "",
        deleteText: "",
        insertText: "The VCS mapping follows.",
      })
    ).toBe(true);
    expect(
      isAppendLeadIn({
        anchorText: "Purpose.",
        deleteText: "",
        insertText: " The VCS mapping follows.",
      })
    ).toBe(false);
  });

  it("treats empty afterAnchor / anchorText as an append block", () => {
    expect(isAppendBlock({})).toBe(true);
    expect(isAppendBlock({ afterAnchor: "Purpose of this verification." })).toBe(
      false
    );
  });
});

describe("same-turn registry", () => {
  it("hands out the latest unused lead-in on the same field", () => {
    const pairing = createSameTurnBlockPairing();
    recordLeadIn(pairing, {
      suggestionId: "lead-1",
      section: "purpose",
      targetField: "narrative",
      payload: { deleteText: "", insertText: "First.", reasoning: "" },
    });
    recordLeadIn(pairing, {
      suggestionId: "lead-2",
      section: "purpose",
      targetField: "narrative",
      payload: { deleteText: "", insertText: "Second.", reasoning: "" },
    });
    expect(takeUnusedLeadIn(pairing, "purpose", "narrative")?.suggestionId).toBe(
      "lead-2"
    );
    expect(takeUnusedLeadIn(pairing, "purpose", "narrative")?.suggestionId).toBe(
      "lead-1"
    );
    expect(takeUnusedLeadIn(pairing, "purpose", "narrative")).toBeUndefined();
  });

  it("does not reuse a recorded block across fields", () => {
    const pairing = createSameTurnBlockPairing();
    recordBlock(pairing, {
      suggestionId: "tbl",
      section: "purpose",
      targetField: "narrative",
      kind: "table",
      payload: { deleteText: "", insertText: "", reasoning: "" },
    });
    expect(takeUnusedBlock(pairing, "define", "narrative")).toBeUndefined();
    expect(takeUnusedBlock(pairing, "purpose", "narrative")?.kind).toBe("table");
  });

  it("pairs afterAnchor with the heading insert that contains it", () => {
    const pairing = createSameTurnBlockPairing();
    recordLeadIn(pairing, {
      suggestionId: "lead-worst",
      section: "cvp_equipment_sampling",
      targetField: "items.2",
      payload: {
        deleteText: "",
        insertText: "## 15.3.3 Pictorial representation",
        reasoning: "",
      },
    });
    recordLeadIn(pairing, {
      suggestionId: "lead-visual",
      section: "cvp_equipment_sampling",
      targetField: "items.2",
      payload: {
        deleteText: "",
        insertText: "## 15.3.6 Visual inspection\nAs a primary verification.",
        reasoning: "",
      },
    });
    expect(
      takeUnusedLeadInMatchingAnchor(
        pairing,
        "cvp_equipment_sampling",
        "items.2",
        "15.3.6 Visual inspection"
      )?.suggestionId
    ).toBe("lead-visual");
  });
});

describe("findOpenBlockPair / sortCommentsForPairedApply", () => {
  const leadIn = comment("lead", {
    deleteText: "",
    insertText: "The VCS mapping follows.",
    reasoning: "intro",
    pairedBlockSuggestionId: "tbl",
    placeBeforePairedBlock: "table",
  });
  const block = comment("tbl", {
    deleteText: "",
    insertText: "",
    reasoning: "table",
    tableOperation: { kind: "create_table", headers: ["A"] },
    placeAfterSuggestionId: "lead",
  });

  it("finds the pair from either card", () => {
    const open = [leadIn, block];
    expect(findOpenBlockPair(block, open)).toEqual({ leadIn, block });
    expect(findOpenBlockPair(leadIn, open)).toEqual({ leadIn, block });
  });

  it("ignores a dismissed sibling", () => {
    expect(
      findOpenBlockPair(block, [
        { ...leadIn, status: "dismissed" },
        block,
      ])
    ).toBeNull();
  });

  it("orders lead-in before its table even if the table is first in the list", () => {
    const ordered = sortCommentsForPairedApply([block, leadIn]);
    expect(ordered.map((item) => item.id)).toEqual(["lead", "tbl"]);
  });

  it("pairs create_table afterAnchor with an open heading that has no pairing ids", () => {
    const heading = comment("lead-visual", {
      deleteText: "",
      insertText: "## 15.3.6 Visual inspection\nAs a primary verification.",
      reasoning: "heading",
    });
    const table = comment("tbl-visual", {
      deleteText: "",
      insertText: "",
      reasoning: "table",
      tableOperation: {
        kind: "create_table",
        headers: ["Sample description / location", "Results"],
        afterAnchor: "15.3.6 Visual inspection",
      },
    });
    const open = [heading, table];
    expect(findOpenBlockPair(table, open)).toEqual({
      leadIn: heading,
      block: table,
    });
    expect(findOpenBlockPair(heading, open)).toEqual({
      leadIn: heading,
      block: table,
    });
    expect(sortCommentsForPairedApply([table, heading]).map((item) => item.id)).toEqual(
      ["lead-visual", "tbl-visual"]
    );
  });
});
