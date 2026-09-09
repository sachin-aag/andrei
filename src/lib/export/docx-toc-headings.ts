import type PizZip from "pizzip";
import type { DocumentType } from "@/db/schema";

/**
 * Map a template heading paragraph onto a Word outline style so
 * Insert → Table of Contents picks it up. `text` is the full concatenated
 * paragraph (template spelling, including trailing colons).
 */
export type TocHeadingSpec = {
  text: string;
  style: "Heading1" | "Heading2" | "Heading3";
  /** Titles that already include their labels in the run text — do not also
   *  apply Heading numbering. */
  suppressNumbering: boolean;
};

const SUPPRESS_NUMBERING =
  `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr>`;

const PARAGRAPH_RE = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
const TEXT_RUN_RE = /<w:t\b[^>]*>([^<]*)<\/w:t>/g;

function heading(
  text: string,
  style: TocHeadingSpec["style"],
  suppressNumbering = true
): TocHeadingSpec {
  return { text, style, suppressNumbering };
}

/** Software DV template (`convergent-design-verification-report-template.docx`). */
export const CONVERGENT_SOFTWARE_DV_TOC_HEADINGS: readonly TocHeadingSpec[] = [
  heading("PURPOSE:", "Heading1"),
  heading("SCOPE:", "Heading1"),
  heading("Testers/Dates:", "Heading1", false),
  heading("Methods of Measurement", "Heading1", false),
  heading("Test Equipment:", "Heading1", false),
  heading("Deviations:", "Heading1", false),
  heading("Results and Discussion:", "Heading1", false),
  heading("Problem or Failure Resolution:", "Heading1", false),
  heading("Conclusion:", "Heading1", false),
  heading("Revision History", "Heading1"),
];

/** Mechanical DV template (`convergent-mechanical-dv-report-template.docx`). */
export const CONVERGENT_MECHANICAL_DV_TOC_HEADINGS: readonly TocHeadingSpec[] = [
  heading("PURPOSE:", "Heading1"),
  heading("SCOPE:", "Heading1"),
  heading("1. Testers/Dates:", "Heading1"),
  heading("2. Methods of Measurement", "Heading1"),
  heading("2.1 Executed Protocol:", "Heading2"),
  heading("2.2 Protocol Deviations:", "Heading2"),
  heading("2.3 Units Under Test (UUT's):", "Heading2"),
  heading("2.4 Test Equipment:", "Heading2"),
  heading("3. Failure/Out of Specification Forms:", "Heading1"),
  heading("4. Results and Discussion:", "Heading1"),
  heading("4.1 Data Collection Forms:", "Heading2"),
  heading("4.2 Requirements Verified:", "Heading2"),
  heading("4.3 Observations:", "Heading2"),
  heading("5. Problem or Failure Resolution:", "Heading1"),
  heading("6. Conclusion:", "Heading1"),
  heading("Revision History", "Heading1"),
];

/** Investigation templates (demo + MJ). */
export const INVESTIGATION_TOC_HEADINGS: readonly TocHeadingSpec[] = [
  heading("Define:", "Heading1"),
  heading("Details Investigation:", "Heading2"),
  heading("Measure:", "Heading1"),
  heading("Analyze:", "Heading1"),
  heading("6 M Method (If Applicable):", "Heading2"),
  heading("5 Why Approach (If Applicable):", "Heading2"),
  heading("Brainstorming:", "Heading2"),
  heading("Other Tool if Any:", "Heading2"),
  heading("Investigation Outcome:", "Heading2"),
  heading("Identified Root Cause/ Probable Cause:", "Heading2"),
  heading(
    "Impact Assessment (System/ Document/ Product/ Equipment/Patient safety/Past batches):",
    "Heading2"
  ),
  heading("Improve:", "Heading1"),
  heading("Corrective Action:", "Heading2"),
  heading("Control:", "Heading1"),
  heading("Preventive Action:", "Heading2"),
  heading("Conclusion:", "Heading1"),
  heading("Document Reviewed:", "Heading1"),
  heading("List of attachment (If applicable):", "Heading2"),
];

/** MJ quality risk assessment (`mj-quality-risk-assessment-template.docx`). */
export const QRA_TOC_HEADINGS: readonly TocHeadingSpec[] = [
  heading("A. PRE-APPROVAL (Before Implementation):", "Heading1"),
  heading("1. DETAILS OF THE RISK ASSESSMENT", "Heading1"),
  heading("1.1 OBJECTIVE", "Heading2"),
  heading("1.2 SCOPE", "Heading2"),
  heading(
    "1.3 SYSTEM / EQUIPMENT / INSTRUMENT / OTHER (IF ANY) OVERVIEW",
    "Heading2"
  ),
  heading("1.4 PROCEDURE", "Heading2"),
  heading("1.5 RISK ASSESSMENT TEAM MEMBERS", "Heading2"),
  heading("1.6 RISK IDENTIFICATION", "Heading2"),
  heading("1.7 RISK MEASUREMENT BY FAILURE MODE EFFECT ANALYSIS", "Heading2"),
  heading("1.8 RISK ASSESSMENT APPROACH", "Heading2"),
  heading(
    "2. RISK IDENTIFICATION AND EVALUATION CONSIDERING CURRENT CONTROL MEASURES",
    "Heading1"
  ),
  heading("3. RISK COMMUNICATION", "Heading1"),
  heading(
    "3.1 RISK ASSESSMENT SUMMARY AND CONCLUSION (Before Implementation):",
    "Heading2"
  ),
  heading("4. MITIGATION PLAN AND CLOSURE", "Heading1"),
  heading(
    "4.1 NEW RISK IDENTIFIED DURING EXECUTION / RESIDUAL RISK (IF ANY)",
    "Heading2"
  ),
  heading("4.2 PERIODIC REVIEW OF IDENTIFIED RISKS", "Heading2"),
  heading(
    "4.3 RISK ASSESSMENT SUMMARY AND CONCLUSION (After Implementation):",
    "Heading2"
  ),
  heading("B. REVISION HISTORY:", "Heading1"),
  heading("C. POST-APPROVAL (After Implementation):", "Heading1"),
];

/** MJ equipment lifecycle report (`mj-equipment-lifecycle-report-template.docx`). */
export const ELR_TOC_HEADINGS: readonly TocHeadingSpec[] = [
  heading("1.0 PURPOSE", "Heading1"),
  heading("2.0 SCOPE", "Heading1"),
  heading("3.0 OBSERVATIONS AND RESULTS", "Heading1"),
  heading("3.1 RESPONSIBILITY", "Heading2"),
  heading("3.2 ABBREVIATIONS", "Heading2"),
  heading("3.3 EQUIPMENT AND SYSTEM DESCRIPTION", "Heading2"),
  heading("3.4 QUALIFICATION AND PERIODIC RE-QUALIFICATION HISTORY", "Heading2"),
  heading("3.5 MEDIA FILL / ASEPTIC PROCESS SIMULATION", "Heading2"),
  heading("3.6 MONITORING", "Heading2"),
  heading("3.7 CALIBRATION OF ASSOCIATED INSTRUMENTS", "Heading2"),
  heading("3.8 PREVENTIVE MAINTENANCE", "Heading2"),
  heading("3.9 BREAKDOWNS AND TRENDS", "Heading2"),
  heading("3.9.1 BREAKDOWN TREND SUMMARY", "Heading3"),
  heading("3.10 QMS RECORDS SINCE LAST PERIODIC RE-QUALIFICATION", "Heading2"),
  heading("3.11 ALARM TRENDS", "Heading2"),
  heading("3.11.1 ALARM TREND SUMMARY", "Heading3"),
  heading("3.12 ACCESS CONTROL", "Heading2"),
  heading("3.13 AUDIT TRAIL REVIEW", "Heading2"),
  heading("3.14 COMPUTERIZED SYSTEM VALIDATION STATUS", "Heading2"),
  heading("4.0 DISCREPANCY / DEVIATIONS (If Any)", "Heading1"),
  heading("5.0 SUMMARY AND CONCLUSION", "Heading1"),
  heading("6.0 RECOMMENDATION", "Heading1"),
  heading("7.0 ATTACHMENTS", "Heading1"),
  heading("8.0 REVISION HISTORY", "Heading1"),
  heading("9.0 APPROVAL PAGE", "Heading1"),
];

export function tocHeadingSpecsForDocumentType(
  documentType: DocumentType
): readonly TocHeadingSpec[] | null {
  switch (documentType) {
    case "design_verification":
      return CONVERGENT_SOFTWARE_DV_TOC_HEADINGS;
    case "mechanical_design_verification":
      return CONVERGENT_MECHANICAL_DV_TOC_HEADINGS;
    case "investigation_report":
      return INVESTIGATION_TOC_HEADINGS;
    case "quality_risk_assessment":
      return QRA_TOC_HEADINGS;
    case "equipment_lifecycle_report":
      return ELR_TOC_HEADINGS;
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

function outlineLevel(style: TocHeadingSpec["style"]): "0" | "1" | "2" {
  switch (style) {
    case "Heading1":
      return "0";
    case "Heading2":
      return "1";
    case "Heading3":
      return "2";
    default: {
      const _exhaustive: never = style;
      return _exhaustive;
    }
  }
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
