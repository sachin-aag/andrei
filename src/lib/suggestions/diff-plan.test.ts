import { describe, expect, it } from "vitest";
import {
  applyFieldPlan,
  canonicalField,
  extractMergeBlocks,
  INLINE_ATOM_WEIGHT,
  operationsCoverWholeField,
  planFieldDiff,
  REWRITE_COVERAGE_THRESHOLD,
} from "@/lib/suggestions/diff-plan";
import { FIXTURES, doc, para } from "@/lib/suggestions/merge-fixtures";

describe("planFieldDiff apply invariant", () => {
  it("rebuilds a prose edit", () => {
    const base = FIXTURES.prose;
    const target = doc(
      para(
        "On 15 January 2026 a dissolution failure was observed for batch B-2024-117 at 68 percent versus the 80 percent specification."
      ),
      para("The investigation proceeded under SOP/DP/QA/008 with QA oversight.")
    );
    const ops = planFieldDiff(base, target);
    expect(ops.length).toBeGreaterThan(0);
    expect(canonicalField(applyFieldPlan(base, ops))).toBe(canonicalField(target));
  });

  it("rebuilds a plain-field line edit", () => {
    const base = FIXTURES.plainField;
    const target =
      "Man: operator on shift B was performing the fill.\nMachine: HPLC 12.\nMethod: SOP-QC-014.";
    const ops = planFieldDiff(base, target);
    expect(ops).toHaveLength(1);
    expect(ops[0]?.blockId).toBe("p0");
    expect(applyFieldPlan(base, ops)).toBe(target);
  });
});

describe("coverage classification (Gap 3)", () => {
  it("weights inline atoms so an image-heavy paragraph is not a rewrite of a tiny text tweak", () => {
    const base = FIXTURES.imageAndEquation;
    const target = doc(
      para("Recorded value ", [
        { type: "mathInline", attrs: { latex: "x=1" } },
        { type: "text", text: " as shown." },
        {
          type: "imageInline",
          attrs: { src: "data:image/png;base64,aaa", alt: "chromatogram" },
        },
      ])
    );
    const ops = planFieldDiff(base, target);
    expect(ops).toHaveLength(1);
    const op = ops[0]!;
    expect(op.classification).toBe("edit");
    expect(op.coverage).toBeLessThanOrEqual(REWRITE_COVERAGE_THRESHOLD);
    const blocks = extractMergeBlocks(base);
    expect(blocks[0]?.atoms).toBe(2);
    expect(blocks[0]?.weight).toBeGreaterThan(2 * INLINE_ATOM_WEIGHT);
  });

  it("classifies a whole-paragraph replacement as a rewrite", () => {
    const base = doc(para("Short stub."));
    const target = doc(
      para(
        "During routine testing the tablet batch failed dissolution at 68 percent, well below the 80 percent specification, triggering this deviation investigation."
      )
    );
    const ops = planFieldDiff(base, target);
    expect(ops[0]?.classification).toBe("rewrite");
    expect(operationsCoverWholeField(ops, extractMergeBlocks(base))).toBe(true);
  });
});

describe("citations are excluded from the diff", () => {
  it("does not treat a regenerated Citations list as a rewrite of the body", () => {
    const base = FIXTURES.citations;
    const target = doc(
      para("Assay failed at 68 percent [protocol.pdf, p. 4]."),
      para(""),
      para("Citations:"),
      para("1. [protocol.pdf, p. 4]"),
      para("2. [lab-notebook.pdf, p. 2]")
    );
    const ops = planFieldDiff(base, target);
    expect(ops).toEqual([]);
  });
});
