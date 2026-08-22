import { beforeAll, describe, expect, it } from "vitest";
import { ensureMathliveSsr } from "@/lib/math/mathlive-ssr";
import { latexToDisplayMathml } from "@/lib/math/latex-to-mathml";

describe("latexToDisplayMathml", () => {
  beforeAll(async () => {
    await ensureMathliveSsr();
  });

  it("wraps plus-minus percent latex in a math element", () => {
    const html = latexToDisplayMathml(String.raw`\pm 20\%`, "inline");
    expect(html).toMatch(/^<math[\s>]/i);
    expect(html).toMatch(/±|&#177;/);
    expect(html).toContain("20");
    expect(html).not.toContain("<script");
  });

  it("marks block math with display=block", () => {
    const html = latexToDisplayMathml(String.raw`\frac{a}{b}`, "block");
    expect(html).toContain('display="block"');
    expect(html).toContain("<mfrac");
  });

  it("returns null for empty latex", () => {
    expect(latexToDisplayMathml("  ", "inline")).toBeNull();
  });
});
