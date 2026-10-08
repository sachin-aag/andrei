import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  flattenQuantityMathInDoc,
  quantityLatexToPlainText,
  shouldFlattenDollarLatex,
} from "@/lib/math/quantity-math";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";

const LANGFUSE_MONITORING = String.raw`$<1\text{ CFU/plate}$`;
const LANGFUSE_PARTICLES = String.raw`$\le 3,520\text{ particles/m}^3 \ge 0.5\,\mu\text{m}$`;
const LANGFUSE_AIRFLOW = String.raw`$0.45 \pm 20\%\text{ m/s}$`;
const LANGFUSE_PM = String.raw`$18\text{ of }18\text{ planned PM work orders executed}$`;
const LANGFUSE_PRQ_WINDOW = String.raw`$\pm 30$`;
const LANGFUSE_REJECTION = String.raw`$\le 5\%$`;
const LANGFUSE_FILL = String.raw`$\pm 0.5\%$`;
const LANGFUSE_YIELD = String.raw`$> 99.2\%$`;

function mathDoc(latex: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Limit " },
          {
            type: "mathInline",
            attrs: { latex, mathml: "", omml: null, ommlDirty: true },
          },
        ],
      },
    ],
  };
}

describe("quantityLatexToPlainText", () => {
  it("flattens the Langfuse Monitoring $<1 CFU/plate$ span that broke Word", () => {
    expect(quantityLatexToPlainText(String.raw`<1\text{ CFU/plate}`)).toBe(
      "<1 CFU/plate"
    );
  });

  it("flattens particle, airflow, PM, PRQ-window and yield TeX from later turns", () => {
    expect(
      quantityLatexToPlainText(
        String.raw`\le 3,520\text{ particles/m}^3 \ge 0.5\,\mu\text{m}`
      )
    ).toBe("≤ 3,520 particles/m³ ≥ 0.5 µm");
    expect(quantityLatexToPlainText(String.raw`0.45 \pm 20\%\text{ m/s}`)).toBe(
      "0.45 ± 20% m/s"
    );
    expect(
      quantityLatexToPlainText(
        String.raw`18\text{ of }18\text{ planned PM work orders executed}`
      )
    ).toBe("18 of 18 planned PM work orders executed");
    expect(quantityLatexToPlainText(String.raw`\pm 30`)).toBe("± 30");
    expect(quantityLatexToPlainText(String.raw`\le 5\%`)).toBe("≤ 5%");
    expect(quantityLatexToPlainText(String.raw`\pm 0.5\%`)).toBe("± 0.5%");
    expect(quantityLatexToPlainText(String.raw`> 99.2\%`)).toBe("> 99.2%");
  });

  it("flattens nested empty \\text{} quantity formulas from CVP rinse volume", () => {
    expect(
      quantityLatexToPlainText(
        String.raw`\text{Rinse Volume (L)} = \text{Surface Area (m)^2\text{}} \times \text{Rinse Factor (L/m)^2\text{}}`
      )
    ).toBe("Rinse Volume (L) = Surface Area (m)² × Rinse Factor (L/m)²");
    expect(
      quantityLatexToPlainText(
        String.raw`\text{Rinse Volume SAF (L)} = \text{Internal Surface Area (m)^2\text{}} \times \text{SAF (L/m)^2\text{}} \times \text{SF}`
      )
    ).toBe(
      "Rinse Volume SAF (L) = Internal Surface Area (m)² × SAF (L/m)² × SF"
    );
    expect(quantityLatexToPlainText(String.raw`V_a = A \times SAF`)).toBe(
      "Vₐ = A × SAF"
    );
    expect(quantityLatexToPlainText("A")).toBe("A");
  });

  it("keeps real equations as math", () => {
    expect(quantityLatexToPlainText(String.raw`\frac{a}{b}`)).toBeNull();
    expect(quantityLatexToPlainText(String.raw`\sum_{i=1}^{n} x_i`)).toBeNull();
  });
});

describe("shouldFlattenDollarLatex", () => {
  it("treats a leading < comparison as quantity prose, not currency", () => {
    expect(shouldFlattenDollarLatex("<1 CFU/plate")).toBe(true);
    expect(shouldFlattenDollarLatex(String.raw`<1\text{ CFU/plate}`)).toBe(
      true
    );
    expect(shouldFlattenDollarLatex("100-$200")).toBe(false);
  });

  it("flattens letter identifiers and quantity equations, not currency", () => {
    expect(shouldFlattenDollarLatex("A")).toBe(true);
    expect(shouldFlattenDollarLatex("SF")).toBe(true);
    expect(shouldFlattenDollarLatex(String.raw`A = B \times C`)).toBe(true);
    expect(shouldFlattenDollarLatex("100-$200")).toBe(false);
  });
});

describe("flattenQuantityMathInDoc", () => {
  it("replaces flattenable mathInline with Unicode so export prose has no holes", () => {
    const { doc, samples } = flattenQuantityMathInDoc(
      mathDoc(String.raw`<1\text{ CFU/plate}`)
    );
    expect(samples).toEqual([String.raw`<1\text{ CFU/plate}`]);
    expect(doc.content?.[0]?.content).toEqual([
      { type: "text", text: "Limit " },
      { type: "text", text: "<1 CFU/plate" },
    ]);
    expect(richJsonToPlainText(doc, { tableFormat: "markdown" })).toContain(
      "<1 CFU/plate"
    );
    expect(richJsonToPlainText(doc)).not.toContain("[equation]");
  });

  it("leaves \\frac atoms in place", () => {
    const { doc, samples } = flattenQuantityMathInDoc(
      mathDoc(String.raw`\frac{a}{b}`)
    );
    expect(samples).toEqual([]);
    expect(doc.content?.[0]?.content?.[1]?.type).toBe("mathInline");
  });
});

describe("Langfuse dollar wrappers", () => {
  it("are the exact Agent markdown that landed in Monitoring / remaining report", () => {
    expect(LANGFUSE_MONITORING).toContain("$<1");
    expect(LANGFUSE_PARTICLES).toContain(String.raw`\le 3,520`);
    expect(LANGFUSE_AIRFLOW).toContain(String.raw`\pm 20\%`);
    expect(LANGFUSE_PM).toContain(String.raw`18\text{ of }18`);
    expect(LANGFUSE_PRQ_WINDOW).toBe(String.raw`$\pm 30$`);
    expect(LANGFUSE_REJECTION).toContain(String.raw`\le 5`);
    expect(LANGFUSE_FILL).toContain(String.raw`\pm 0.5`);
    expect(LANGFUSE_YIELD).toContain("99.2");
  });
});
