import { describe, expect, it } from "vitest";
import {
  isMathAtomNode,
  mathAtomDisplayText,
  MISSING_LATEX_MATH_ANCHOR,
} from "@/lib/tiptap/math-anchor";

describe("mathAtomDisplayText", () => {
  it("wraps stored latex in $...$ so chat can quote it", () => {
    expect(
      mathAtomDisplayText({
        type: "mathInline",
        attrs: { latex: String.raw`\frac{a}{b}` },
      })
    ).toBe(String.raw`$\frac{a}{b}$`);
  });

  it("does not double-wrap latex that already has dollars", () => {
    expect(
      mathAtomDisplayText({
        type: "mathBlock",
        attrs: { latex: "$x=1$" },
      })
    ).toBe("$x=1$");
  });

  it("uses $equation$ when latex is missing so the hole is visible", () => {
    expect(mathAtomDisplayText({ type: "mathInline" })).toBe(
      MISSING_LATEX_MATH_ANCHOR
    );
    expect(
      mathAtomDisplayText({ type: "mathInline", attrs: { latex: "  " } })
    ).toBe(MISSING_LATEX_MATH_ANCHOR);
  });
});

describe("isMathAtomNode", () => {
  it("matches inline and block math only", () => {
    expect(isMathAtomNode({ type: "mathInline" })).toBe(true);
    expect(isMathAtomNode({ type: "mathBlock" })).toBe(true);
    expect(isMathAtomNode({ type: "imageInline" })).toBe(false);
    expect(isMathAtomNode({ type: "tableRef" })).toBe(false);
  });
});
