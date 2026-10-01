import { beforeAll, describe, expect, it } from "vitest";
import { convertLatexToMathMl, ensureMathliveSsr } from "@/lib/math/mathlive-ssr";
import {
  escapeOmmlTextNodes,
  ommlFragmentToMathml,
  mathmlToOmmlFragment,
  resolveOmmlFromMathAttrs,
} from "@/lib/math/omml-mathml";

describe("omml-mathml conversion", () => {
  beforeAll(async () => {
    await ensureMathliveSsr();
  });
  it("converts simple MathML to OMML", () => {
    const mathml =
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mn>1</mn><mo>+</mo><mn>1</mn></mrow></math>';
    const omml = mathmlToOmmlFragment(mathml);
    expect(omml).toContain("oMath");
  });

  it("converts MathLive MathML (from LaTeX) to OMML", () => {
    const mathml = convertLatexToMathMl(String.raw`\frac{a}{b}`);
    const omml = mathmlToOmmlFragment(mathml);
    expect(omml).toContain("oMath");
    expect(omml).toContain('xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"');
    expect(omml).not.toContain("xmlns:w=");
  });

  it("resolves OMML from latex-only attrs (imported legacy formulas)", () => {
    const omml = resolveOmmlFromMathAttrs({
      mathml: "",
      latex: String.raw`\frac{a}{b}`,
      omml: null,
      ommlDirty: true,
    });
    expect(omml).toContain("oMath");
  });

  it("converts OMML back to MathML", () => {
    const omml =
      '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>2+2=4</m:t></m:r></m:oMath>';
    const mathml = ommlFragmentToMathml(omml);
    expect(mathml).toContain("<math");
  });

  it("XML-escapes a raw < in OMML m:t (the Word-breaking $<1 CFU/plate$ case)", () => {
    const escaped = escapeOmmlTextNodes(
      '<m:t xml:space="preserve"><1 CFU/plate</m:t>'
    );
    expect(escaped).toBe(
      '<m:t xml:space="preserve">&lt;1 CFU/plate</m:t>'
    );
    expect(escaped).not.toMatch(/<m:t[^>]*><1/);
  });

  it("escapes cached OMML that already contains a raw <", () => {
    const omml = resolveOmmlFromMathAttrs({
      mathml: "",
      latex: "",
      omml: '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t><1 CFU/plate</m:t></m:r></m:oMath>',
      ommlDirty: false,
    });
    expect(omml).toContain("&lt;1 CFU/plate");
    expect(omml).not.toMatch(/<m:t[^>]*><1/);
  });
});
