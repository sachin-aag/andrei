import type PizZip from "pizzip";
import type { DocumentType } from "@/db/schema";

/**
 * Map a Convergent DV template heading paragraph onto a Word outline style so
 * Insert → Table of Contents picks it up. `text` is the full concatenated
 * paragraph (template spelling, including trailing colons).
 */
export type TocHeadingSpec = {
  text: string;
  style: "Heading1" | "Heading2";
  /** PURPOSE/SCOPE/Revision History and mechanical numbered titles already
   *  include their labels in the run text — do not also apply Heading numbering. */
  suppressNumbering: boolean;
};

const SUPPRESS_NUMBERING =
  `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr>`;

const PARAGRAPH_RE = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
const TEXT_RUN_RE = /<w:t\b[^>]*>([^<]*)<\/w:t>/g;

/** Software DV template (`convergent-design-verification-report-template.docx`). */
export const CONVERGENT_SOFTWARE_DV_TOC_HEADINGS: readonly TocHeadingSpec[] = [
  { text: "PURPOSE:", style: "Heading1", suppressNumbering: true },
  { text: "SCOPE:", style: "Heading1", suppressNumbering: true },
  { text: "Testers/Dates:", style: "Heading1", suppressNumbering: false },
  { text: "Methods of Measurement", style: "Heading1", suppressNumbering: false },
  { text: "Test Equipment:", style: "Heading1", suppressNumbering: false },
  { text: "Deviations:", style: "Heading1", suppressNumbering: false },
  { text: "Results and Discussion:", style: "Heading1", suppressNumbering: false },
  {
    text: "Problem or Failure Resolution:",
    style: "Heading1",
    suppressNumbering: false,
  },
  { text: "Conclusion:", style: "Heading1", suppressNumbering: false },
  { text: "Revision History", style: "Heading1", suppressNumbering: true },
];

/** Mechanical DV template (`convergent-mechanical-dv-report-template.docx`). */
export const CONVERGENT_MECHANICAL_DV_TOC_HEADINGS: readonly TocHeadingSpec[] = [
  { text: "PURPOSE:", style: "Heading1", suppressNumbering: true },
  { text: "SCOPE:", style: "Heading1", suppressNumbering: true },
  { text: "1. Testers/Dates:", style: "Heading1", suppressNumbering: true },
  { text: "2. Methods of Measurement", style: "Heading1", suppressNumbering: true },
  { text: "2.1 Executed Protocol:", style: "Heading2", suppressNumbering: true },
  { text: "2.2 Protocol Deviations:", style: "Heading2", suppressNumbering: true },
  {
    text: "2.3 Units Under Test (UUT's):",
    style: "Heading2",
    suppressNumbering: true,
  },
  { text: "2.4 Test Equipment:", style: "Heading2", suppressNumbering: true },
  {
    text: "3. Failure/Out of Specification Forms:",
    style: "Heading1",
    suppressNumbering: true,
  },
  { text: "4. Results and Discussion:", style: "Heading1", suppressNumbering: true },
  { text: "4.1 Data Collection Forms:", style: "Heading2", suppressNumbering: true },
  { text: "4.2 Requirements Verified:", style: "Heading2", suppressNumbering: true },
  { text: "4.3 Observations:", style: "Heading2", suppressNumbering: true },
  {
    text: "5. Problem or Failure Resolution:",
    style: "Heading1",
    suppressNumbering: true,
  },
  { text: "6. Conclusion:", style: "Heading1", suppressNumbering: true },
  { text: "Revision History", style: "Heading1", suppressNumbering: true },
];

export function tocHeadingSpecsForDocumentType(
  packId: string,
  documentType: DocumentType
): readonly TocHeadingSpec[] | null {
  if (packId !== "convergent") return null;
  switch (documentType) {
    case "design_verification":
      return CONVERGENT_SOFTWARE_DV_TOC_HEADINGS;
    case "mechanical_design_verification":
      return CONVERGENT_MECHANICAL_DV_TOC_HEADINGS;
    case "investigation_report":
    case "quality_risk_assessment":
    case "generic_document":
      return null;
    default: {
      const _exhaustive: never = documentType;
      return _exhaustive;
    }
  }
}

export function docxParagraphPlainText(paragraphXml: string): string {
  let text = "";
  TEXT_RUN_RE.lastIndex = 0;
  for (const match of paragraphXml.matchAll(TEXT_RUN_RE)) {
    text += decodeXmlEntities(match[1] ?? "");
  }
  return text;
}

export function applyTocHeadingStylesToDocumentXml(
  xml: string,
  specs: readonly TocHeadingSpec[]
): string {
  const byText = new Map(specs.map((spec) => [spec.text, spec]));
  return xml.replace(PARAGRAPH_RE, (paragraph) => {
    const spec = byText.get(docxParagraphPlainText(paragraph));
    if (!spec) return paragraph;
    return applyHeadingStyleToParagraph(paragraph, spec);
  });
}

export function applyTocHeadingStylesToDocxZip(
  zip: PizZip,
  specs: readonly TocHeadingSpec[]
): void {
  const file = zip.file("word/document.xml");
  if (!file) return;
  zip.file(
    "word/document.xml",
    applyTocHeadingStylesToDocumentXml(file.asText(), specs)
  );
}

function outlineLevel(style: TocHeadingSpec["style"]): "0" | "1" {
  return style === "Heading1" ? "0" : "1";
}

function applyHeadingStyleToParagraph(
  paragraph: string,
  spec: TocHeadingSpec
): string {
  const styleTag = `<w:pStyle w:val="${spec.style}"/>`;
  const outlineTag = `<w:outlineLvl w:val="${outlineLevel(spec.style)}"/>`;

  let next = paragraph;
  if (!/<w:pPr[\s>]/.test(next)) {
    next = next.replace(/^(<w:p\b[^>]*>)/, "$1<w:pPr></w:pPr>");
  }

  if (/<w:pStyle\b/.test(next)) {
    next = next.replace(/<w:pStyle\b[^>]*\/>/, styleTag);
    next = next.replace(/<w:pStyle\b[^>]*>\s*<\/w:pStyle>/, styleTag);
  } else {
    next = next.replace(/<w:pPr([^>]*)>/, `<w:pPr$1>${styleTag}`);
  }

  if (/<w:outlineLvl\b/.test(next)) {
    next = next.replace(/<w:outlineLvl\b[^>]*\/>/, outlineTag);
  } else {
    next = next.replace(styleTag, `${styleTag}${outlineTag}`);
  }

  if (!spec.suppressNumbering) return next;

  if (/<w:numPr[\s>]/.test(next)) {
    return next.replace(/<w:numPr\b[\s\S]*?<\/w:numPr>/, SUPPRESS_NUMBERING);
  }
  return next.replace(styleTag, `${styleTag}${SUPPRESS_NUMBERING}`);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
