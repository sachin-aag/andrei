import { describe, expect, it } from "vitest";
import { planFieldDiff } from "@/lib/suggestions/diff-plan";
import { FIXTURES, doc, para } from "@/lib/suggestions/merge-fixtures";

/**
 * Step 0 — if identity fails broadly, stop and reconsider markdown diffing
 * instead of TipTap JSON. These fixtures must stay green as the planner grows.
 */
describe("Step 0 — plan(base → base) is empty", () => {
  for (const [name, field] of Object.entries(FIXTURES)) {
    it(`is a no-op for ${name}`, () => {
      expect(planFieldDiff(field, field)).toEqual([]);
    });
  }

  it("treats pending suggestion marks as absent so identity still holds against clean current", () => {
    const pending = FIXTURES.genericPendingMarks;
    const clean = doc(para("Purpose: verify output."));
    expect(planFieldDiff(pending, clean)).toEqual([]);
    expect(planFieldDiff(clean, pending)).toEqual([]);
  });

  it("does not emit operations for a Citations block versus itself", () => {
    expect(planFieldDiff(FIXTURES.citations, FIXTURES.citations)).toEqual([]);
  });
});
