import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  COALESCING_GAP,
  combineSuggestionReasoning,
  foldNearbyProposeEdit,
  nearbyCoalesceSkipReason,
  rangeForSuggestionEditOnField,
  rangeGap,
  rangesWithinCoalescingGap,
  unionRange,
} from "@/lib/suggestions/coalesce-nearby-edits";
import { buildSuggestionRecord } from "@/lib/suggestions/suggestion-record";

const NARRATIVE =
  "The assay failed due to temperature drift. The batch was released anyway. Operators later noted humidity on the log.";

function paragraphDoc(text: string): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

describe("rangeGap / rangesWithinCoalescingGap", () => {
  it("treats overlapping and touching ranges as gap 0", () => {
    expect(rangeGap({ start: 0, end: 10 }, { start: 8, end: 20 })).toBe(0);
    expect(rangeGap({ start: 0, end: 10 }, { start: 10, end: 18 })).toBe(0);
  });

  it("measures the characters between disjoint ranges", () => {
    expect(rangeGap({ start: 0, end: 10 }, { start: 25, end: 30 })).toBe(15);
    expect(rangeGap({ start: 40, end: 50 }, { start: 0, end: 10 })).toBe(30);
  });

  it("uses the same < 20 cutoff as word-diff coalescing", () => {
    expect(COALESCING_GAP).toBe(20);
    expect(
      rangesWithinCoalescingGap({ start: 0, end: 10 }, { start: 29, end: 35 })
    ).toBe(true);
    expect(
      rangesWithinCoalescingGap({ start: 0, end: 10 }, { start: 30, end: 35 })
    ).toBe(false);
  });

  it("unions the covering span", () => {
    expect(unionRange({ start: 4, end: 10 }, { start: 18, end: 24 })).toEqual({
      start: 4,
      end: 24,
    });
  });
});

describe("nearbyCoalesceSkipReason", () => {
  it("skips lead-ins, tables, images, citation seconds, and cells", () => {
    expect(nearbyCoalesceSkipReason({ leadIn: true })).toBe("lead_in");
    expect(nearbyCoalesceSkipReason({ tableOperation: { kind: "edit_cells" } })).toBe(
      "table"
    );
    expect(nearbyCoalesceSkipReason({ insertImage: { src: "x" } })).toBe("image");
    expect(nearbyCoalesceSkipReason({ second: { insertText: "Citations:" } })).toBe(
      "second"
    );
    expect(nearbyCoalesceSkipReason({ scope: { kind: "cell" } })).toBe("cell_scope");
    expect(nearbyCoalesceSkipReason({ scope: { kind: "listItem" } })).toBeNull();
  });
});

describe("foldNearbyProposeEdit", () => {
  it("folds a second nearby span into one frozen hunk that keeps the bridge", () => {
    const live = { narrative: paragraphDoc(NARRATIVE) };
    const first = buildSuggestionRecord({
      sectionContent: live,
      section: "define",
      targetField: "narrative",
      documentType: "investigation_report",
      input: {
        kind: "located",
        edit: {
          anchorText: "temperature drift",
          deleteText: "temperature drift",
          insertText: "humidity excursion",
        },
      },
    });
    expect(first).not.toBeNull();
    const existingPayload = {
      deleteText: "temperature drift",
      insertText: "humidity excursion",
      reasoning: "Name the actual cause.",
      suggestionBase: first!.base,
      suggestionIntent: first!.intent,
    };
    const folded = foldNearbyProposeEdit({
      existingPayload,
      liveContent: live,
      section: "define",
      targetField: "narrative",
      documentType: "investigation_report",
      proposed: {
        anchorText: "batch was released",
        deleteText: "batch was released",
        insertText: "batch remained in quarantine",
      },
      reasoning: "Do not imply release.",
    });
    expect(folded).not.toBeNull();
    expect(folded!.payload.deleteText).toContain("temperature drift");
    expect(folded!.payload.deleteText).toContain("batch was released");
    expect(folded!.payload.insertText).toContain("humidity excursion");
    expect(folded!.payload.insertText).toContain("batch remained in quarantine");
    expect(folded!.payload.reasoning).toContain("Name the actual cause.");
    expect(folded!.payload.reasoning).toContain("Do not imply release.");
  });

  it("returns null when the second span does not locate on the stored intent", () => {
    const live = { narrative: paragraphDoc(NARRATIVE) };
    const first = buildSuggestionRecord({
      sectionContent: live,
      section: "define",
      targetField: "narrative",
      documentType: "investigation_report",
      input: {
        kind: "located",
        edit: {
          anchorText: "temperature drift",
          deleteText: "temperature drift",
          insertText: "humidity excursion",
        },
      },
    });
    const folded = foldNearbyProposeEdit({
      existingPayload: {
        deleteText: "temperature drift",
        insertText: "humidity excursion",
        reasoning: "Name the actual cause.",
        suggestionBase: first!.base,
        suggestionIntent: first!.intent,
      },
      liveContent: live,
      section: "define",
      targetField: "narrative",
      documentType: "investigation_report",
      proposed: {
        anchorText: "temperature drift",
        deleteText: "temperature drift",
        insertText: "a different reword of the same span",
      },
      reasoning: "Overlap.",
    });
    expect(folded).toBeNull();
  });
});

describe("rangeForSuggestionEditOnField", () => {
  it("locates a unique delete span in a rich field", () => {
    const doc = paragraphDoc(NARRATIVE);
    const range = rangeForSuggestionEditOnField({
      fieldText: NARRATIVE,
      fieldDoc: doc,
      edit: {
        anchorText: "temperature drift",
        deleteText: "temperature drift",
        insertText: "humidity excursion",
      },
    });
    expect(range).toEqual({
      start: NARRATIVE.indexOf("temperature drift"),
      end: NARRATIVE.indexOf("temperature drift") + "temperature drift".length,
    });
  });
});

describe("combineSuggestionReasoning", () => {
  it("joins distinct sentences and skips duplicates", () => {
    expect(combineSuggestionReasoning("Fix A.", "Fix A.")).toBe("Fix A.");
    expect(combineSuggestionReasoning("Fix A.", "Fix B.")).toBe("Fix A. Fix B.");
  });
});
