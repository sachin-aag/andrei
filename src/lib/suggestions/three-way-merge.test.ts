import { describe, expect, it } from "vitest";
import { planFieldDiff } from "@/lib/suggestions/diff-plan";
import { mergeField } from "@/lib/suggestions/three-way-merge";
import { FIXTURES, doc, para } from "@/lib/suggestions/merge-fixtures";

describe("mergeField", () => {
  it("is a noop when current already equals intent", () => {
    const result = mergeField(FIXTURES.prose, FIXTURES.prose, FIXTURES.prose);
    expect(result.status).toBe("noop");
    expect(result.operations).toEqual([]);
  });

  it("applies intent when current still matches base", () => {
    const base = doc(para("The assay failed at 68 percent."));
    const intent = doc(para("The assay failed at 68 percent versus the 80 percent limit."));
    const result = mergeField(base, base, intent);
    expect(result.status).toBe("clean");
    expect(result.operations.length).toBeGreaterThan(0);
  });

  it("keeps the user's edit when intent matches base", () => {
    const base = doc(para("The assay failed at 68 percent."));
    const current = doc(para("The assay failed at 68 percent on batch B-2024-117."));
    const result = mergeField(base, current, base);
    expect(result.status).toBe("noop");
  });

  it("merges non-overlapping line edits on a plain field", () => {
    const base = FIXTURES.plainField;
    const current =
      "Man: operator on shift B was performing the fill.\nMachine: HPLC 12.\nMethod: SOP-QC-014.";
    const intent =
      "Man: operator on shift A was performing the fill.\nMachine: HPLC 12.\nMethod: SOP-QC-014 rev 3.";
    const result = mergeField(base, current, intent);
    expect(result.status).toBe("clean");
    expect(result.merged).toBe(
      "Man: operator on shift B was performing the fill.\nMachine: HPLC 12.\nMethod: SOP-QC-014 rev 3."
    );
  });

  it("conflicts when both sides rewrite the same sentence", () => {
    const base = doc(para("The assay failed at 68 percent."));
    const current = doc(para("The assay passed after retest."));
    const intent = doc(para("The assay is invalid and will be repeated."));
    const result = mergeField(base, current, intent);
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") {
      expect(result.conflicts.length).toBeGreaterThan(0);
    }
  });

  it("does not invent a Citations duplicate after merge", () => {
    const result = mergeField(
      FIXTURES.citations,
      FIXTURES.citations,
      FIXTURES.citations
    );
    expect(planFieldDiff(result.merged, FIXTURES.citations)).toEqual([]);
  });
});
