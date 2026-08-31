import { describe, expect, it } from "vitest";
import {
  createSameTurnNearbyEdits,
  findNearbyTurnEdit,
  recordNearbyEdit,
} from "@/lib/suggestions/same-turn-nearby-edit";

const payload = {
  deleteText: "a",
  insertText: "b",
  reasoning: "r",
};

describe("findNearbyTurnEdit", () => {
  it("returns the closest same-field card within the coalescing gap", () => {
    const store = createSameTurnNearbyEdits();
    recordNearbyEdit(store, {
      suggestionId: "near",
      section: "define",
      targetField: "narrative",
      range: { start: 0, end: 10 },
      payload,
    });
    recordNearbyEdit(store, {
      suggestionId: "far",
      section: "define",
      targetField: "narrative",
      range: { start: 80, end: 90 },
      payload,
    });
    recordNearbyEdit(store, {
      suggestionId: "other-field",
      section: "define",
      targetField: "what",
      range: { start: 12, end: 16 },
      payload,
    });
    const hit = findNearbyTurnEdit(store, {
      section: "define",
      targetField: "narrative",
      range: { start: 18, end: 24 },
    });
    expect(hit?.suggestionId).toBe("near");
    expect(
      findNearbyTurnEdit(store, {
        section: "define",
        targetField: "narrative",
        range: { start: 40, end: 48 },
      })
    ).toBeUndefined();
  });

  it("updates range and payload when the same card is recorded again", () => {
    const store = createSameTurnNearbyEdits();
    recordNearbyEdit(store, {
      suggestionId: "one",
      section: "define",
      targetField: "narrative",
      range: { start: 0, end: 10 },
      payload,
    });
    recordNearbyEdit(store, {
      suggestionId: "one",
      section: "define",
      targetField: "narrative",
      range: { start: 0, end: 24 },
      payload: { ...payload, reasoning: "both" },
    });
    expect(store.edits).toHaveLength(1);
    expect(store.edits[0]?.range).toEqual({ start: 0, end: 24 });
    expect(store.edits[0]?.payload.reasoning).toBe("both");
  });
});
