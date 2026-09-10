import { describe, expect, it } from "vitest";
import {
  applyTocHeadingStylesToDocumentXml,
  CONVERGENT_MECHANICAL_DV_TOC_HEADINGS,
  CONVERGENT_SOFTWARE_DV_TOC_HEADINGS,
  docxParagraphPlainText,
  tocHeadingSpecsForDocumentType,
} from "./docx-toc-headings";

function paragraphFor(xml: string, text: string): string | undefined {
  const paras = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? [];
  return paras.find((para) => docxParagraphPlainText(para) === text);
}

describe("tocHeadingSpecsForDocumentType", () => {
  it("is gated to Convergent software and mechanical DV", () => {
    expect(tocHeadingSpecsForDocumentType("convergent", "design_verification")).toBe(
      CONVERGENT_SOFTWARE_DV_TOC_HEADINGS
    );
    expect(
      tocHeadingSpecsForDocumentType(
        "convergent",
        "mechanical_design_verification"
      )
    ).toBe(CONVERGENT_MECHANICAL_DV_TOC_HEADINGS);
    expect(tocHeadingSpecsForDocumentType("demo", "design_verification")).toBeNull();
    expect(
      tocHeadingSpecsForDocumentType("convergent", "investigation_report")
    ).toBeNull();
  });
});

describe("applyTocHeadingStylesToDocumentXml", () => {
  it("marks unstyled PURPOSE as Heading1 without auto-numbering", () => {
    const xml =
      `<w:document><w:body>` +
      `<w:p><w:pPr><w:jc w:val="both"/></w:pPr>` +
      `<w:r><w:t>PURPOSE:</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>{@purposeXml}</w:t></w:r></w:p>` +
      `</w:body></w:document>`;

    const out = applyTocHeadingStylesToDocumentXml(
      xml,
      CONVERGENT_SOFTWARE_DV_TOC_HEADINGS
    );
    const purpose = paragraphFor(out, "PURPOSE:");
    expect(purpose).toContain('<w:pStyle w:val="Heading1"/>');
    expect(purpose).toContain('<w:outlineLvl w:val="0"/>');
    expect(purpose).toContain('<w:numId w:val="0"/>');
    expect(paragraphFor(out, "{@purposeXml}")).not.toContain("Heading1");
  });

  it("keeps existing Heading1 numbering on Testers/Dates", () => {
    const xml =
      `<w:p><w:pPr>` +
      `<w:pStyle w:val="Heading1"/>` +
      `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="13"/></w:numPr>` +
      `</w:pPr>` +
      `<w:r><w:t>Testers/Dates:</w:t></w:r></w:p>`;

    const out = applyTocHeadingStylesToDocumentXml(
      xml,
      CONVERGENT_SOFTWARE_DV_TOC_HEADINGS
    );
    const testers = paragraphFor(out, "Testers/Dates:");
    expect(testers).toContain('<w:pStyle w:val="Heading1"/>');
    expect(testers).toContain('<w:outlineLvl w:val="0"/>');
    expect(testers).toContain('<w:numId w:val="13"/>');
    expect(testers).not.toContain('<w:numId w:val="0"/>');
  });

  it("marks mechanical subsections as Heading2", () => {
    const xml =
      `<w:p><w:r><w:t xml:space="preserve">2. Methods of Measurement</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t xml:space="preserve">2.1 Executed Protocol:</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t xml:space="preserve">2.3 Units Under Test (UUT's):</w:t></w:r></w:p>`;

    const out = applyTocHeadingStylesToDocumentXml(
      xml,
      CONVERGENT_MECHANICAL_DV_TOC_HEADINGS
    );
    expect(paragraphFor(out, "2. Methods of Measurement")).toContain(
      '<w:pStyle w:val="Heading1"/>'
    );
    const executed = paragraphFor(out, "2.1 Executed Protocol:");
    expect(executed).toContain('<w:pStyle w:val="Heading2"/>');
    expect(executed).toContain('<w:outlineLvl w:val="1"/>');
    expect(executed).toContain('<w:numId w:val="0"/>');
    expect(paragraphFor(out, "2.3 Units Under Test (UUT's):")).toContain(
      "Heading2"
    );
  });
});
