import type { JSONContent } from "@tiptap/core";
import { emptyDoc } from "@/lib/tiptap/rich-text";

/** Fixed-header TipTap table stored as a rich doc. */
export type DvTableSection = {
  table: JSONContent;
};

export type DvNarrativeSection = {
  narrative: JSONContent;
};

export type DvPurposeScopeSection = {
  narrative: JSONContent;
};

export type DvReferencesSection = {
  narrative: JSONContent;
};

export type DvTraceabilitySection = DvTableSection;

export type DvTestMethodsSection = {
  narrative: JSONContent;
};

export type DvTestResultsSection = DvTableSection;

export type DvDeviationsSection = {
  narrative: JSONContent;
};

export type DvConclusionSection = {
  narrative: JSONContent;
};

export type DvApprovalSection = {
  narrative: JSONContent;
};

export type DvAppendicesSection = {
  narrative: JSONContent;
};

export type DesignVerificationSectionMap = {
  purpose_scope: DvPurposeScopeSection;
  references: DvReferencesSection;
  traceability: DvTraceabilitySection;
  test_methods: DvTestMethodsSection;
  test_results: DvTestResultsSection;
  deviations: DvDeviationsSection;
  conclusion: DvConclusionSection;
  approval_signoff: DvApprovalSection;
  appendices: DvAppendicesSection;
};

export const DV_SECTION_KEYS = [
  "purpose_scope",
  "references",
  "traceability",
  "test_methods",
  "test_results",
  "deviations",
  "conclusion",
  "approval_signoff",
  "appendices",
] as const;

export type DesignVerificationSectionKey =
  (typeof DV_SECTION_KEYS)[number];

/** Virtual section key for cover-page criteria (lives in reports.metadata). */
export const DV_COVER_PAGE_SECTION = "cover_page" as const;

export const DV_TRACEABILITY_HEADERS = [
  "Requirement ID",
  "Design Input",
  "Test Method / ID",
  "Result",
  "Risk Control Link",
] as const;

export const DV_TEST_RESULTS_HEADERS = [
  "Test ID",
  "Requirement ID",
  "Result",
  "Pass/Fail",
  "Raw Data Ref",
] as const;

export const CONVERGENT_EQUIPMENT_HEADERS = [
  "Equipment",
  "Manufacturer",
  "Model / Part No.",
  "CD Asset Tag / Serial No.",
  "Calibration Due",
] as const;

export const CONVERGENT_RESULTS_HEADERS = [
  "Req. ID",
  "Req. Description",
  "Satisfied by",
  "P/F",
] as const;

/** Demo DV sections whose TipTap field is a fixed-header matrix (`content.table`). */
export const DV_TABLE_SECTIONS = ["traceability", "test_results"] as const;

export const CONVERGENT_DV_TABLE_SECTIONS = [
  "test_equipment",
  "results_and_discussions",
] as const;

export type DvTableSectionKey = (typeof DV_TABLE_SECTIONS)[number];

export type ConvergentDvTableSectionKey =
  (typeof CONVERGENT_DV_TABLE_SECTIONS)[number];

/** True when the section stores a seeded matrix on `content.table`. */
export function isDvTableSection(section: string): boolean {
  return (
    (DV_TABLE_SECTIONS as readonly string[]).includes(section) ||
    (CONVERGENT_DV_TABLE_SECTIONS as readonly string[]).includes(section)
  );
}

/** True when `table` is the only editable rich field (suggest/chat hints). */
export function isDvTableOnlySection(section: string): boolean {
  return (
    section === "traceability" ||
    section === "test_results" ||
    section === "test_equipment"
  );
}

export function dvTableHeadersForSection(section: string): readonly string[] {
  switch (section) {
    case "traceability":
      return DV_TRACEABILITY_HEADERS;
    case "test_results":
      return DV_TEST_RESULTS_HEADERS;
    case "test_equipment":
      return CONVERGENT_EQUIPMENT_HEADERS;
    case "results_and_discussions":
      return CONVERGENT_RESULTS_HEADERS;
    default:
      return [];
  }
}

function gfmHeaderExample(headers: readonly string[]): string {
  const cells = headers.join(" | ");
  const sep = headers.map(() => "---").join(" | ");
  return `| ${cells} |\n| ${sep} |`;
}

/** How to fill Convergent Results and Discussion P/F rows (chat + suggest). */
export const CONVERGENT_RESULTS_MATRIX_FILLING_NOTES = `Results and Discussion P/F table — column filling:
- Headers are Req. ID | Req. Description | Satisfied by | P/F (punctuation and capitalisation as shown).
- P/F is per configuration, not a bare Pass/Fail: "P for TOP-00017 PCON" or "P for TOP-00051, TOP-00017 PCON and TOP-00017 LCD-2".
- Satisfied by names the configuration datasheets and the appendix they are attached in. Example: "TOP-00017 PCON datasheets (See Appendix B)".
- If the same requirement was run on more than one configuration, list every configuration in both Satisfied by and P/F. Keep one row per Req. ID.
- Req. ID must match the evidence exactly, including dotted suffixes (\`SW-SST-5.1.1\` is not \`SW-SST-5\`). Do not collapse a child ID into its parent family.
- When the source has a Requirements Verified table (or a partial-execution datasheet/TOC list), publish those rows — not every requirement ID mentioned in the protocol body.
- Do not invent a configuration. If evidence does not name one, use a bracketed placeholder like [configuration].`;

/** Chat-only: Results and Discussion has two fields — never put the matrix in Discussion. */
export const CONVERGENT_RESULTS_FIELD_SPLIT_NOTES = `Results and Discussion field split (required):
- This section has TWO fields. Always make two separate draft_field calls.
- targetField \`narrative\` (Discussion): prose only. Testing-per line, Data Collection Forms, Requirements Verified heading, and Observations. NEVER include a markdown table or Req. ID / Satisfied by / P/F rows here.
- targetField \`table\` (Results matrix): ONE GFM table only with headers Req. ID | Req. Description | Satisfied by | P/F. No headings, no observations, no wrapping prose.
- WRONG: one draft_field to narrative that contains the requirements table. RIGHT: narrative gets the outline; table gets the matrix.`;

/**
 * Prompt block telling chat / suggest models to keep seeded matrix columns.
 * Shared by chat draftingGuidance and suggest-fix prompts.
 */
export function dvFixedTableFormatGuidance(opts?: {
  /** When set, only describe that section's schema. */
  section?: string;
  /** Override the section list (Convergent vs demo DV). */
  sections?: readonly string[];
  labels?: Readonly<Record<string, string>>;
  /** "chat" mentions draft_field; "suggest" mentions cell-level edits. */
  surface?: "chat" | "suggest";
}): string {
  const surface = opts?.surface ?? "chat";
  const sections: string[] = opts?.section
    ? [opts.section]
    : opts?.sections
      ? [...opts.sections]
      : [...DV_TABLE_SECTIONS];
  const labels: Readonly<Record<string, string>> = opts?.labels ?? DV_SECTION_LABELS;

  const schemas = sections
    .map((key) => {
      const label = labels[key] ?? key;
      const headers = dvTableHeadersForSection(key);
      return `${label} [${key}] — targetField \`table\`:\n${gfmHeaderExample(headers)}`;
    })
    .join("\n\n");

  const equipmentLeadIn =
    sections.includes("test_equipment") && surface === "chat"
      ? `
- Test Equipment exception: a one-line lead-in starting with "The table below lists all equipment used for testing..." is required before each GFM table (one table per execution). Do not put that lead-in in Methods of Measurement.`
      : "";

  const surfaceRules =
    surface === "chat"
      ? `- When creating a new table or the engineer explicitly asks for a full replacement via draft_field, emit ONE GFM markdown table only (header + separator + data rows), except for the Test Equipment lead-in noted below.
- Use EXACTLY the headers below, in this order — never rename, reorder, add, or drop columns.
- If the section already has a table, use edit_table to change cells or add/delete rows. Do not use draft_field for an incremental change — that would overwrite filled cells.
- Fill known cells; use bracketed placeholders like [requirement ID] for unknowns. Leave optional cells blank rather than inventing new columns.${equipmentLeadIn}`
      : `- targetField MUST be "table".
- Preserve the existing column headers exactly — never rename, reorder, add, or drop columns.
- Prefer minimal cell-value edits (anchorText from SECTION CONTENT). Do not rewrite the matrix into a different column layout or free-form prose.
- If filling a gap requires new rows, keep the same header set and column order.`;

  const fillingNotes = sections.includes("results_and_discussions")
    ? `\n\n${CONVERGENT_RESULTS_MATRIX_FILLING_NOTES}${
        surface === "chat" ? `\n\n${CONVERGENT_RESULTS_FIELD_SPLIT_NOTES}` : ""
      }`
    : "";

  return `## Fixed table formats (required)
${sections.length === 1 ? "This section" : "These sections"} use a seeded TipTap matrix with a fixed column schema. Stick to that format.

${surfaceRules}

${schemas}${fillingNotes}`;
}

function headerRow(headers: readonly string[]): JSONContent {
  return {
    type: "tableRow",
    content: headers.map((text) => ({
      type: "tableHeader",
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text }],
        },
      ],
    })),
  };
}

function emptyDataRow(columnCount: number): JSONContent {
  return {
    type: "tableRow",
    content: Array.from({ length: columnCount }, () => ({
      type: "tableCell",
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: [{ type: "paragraph" }],
    })),
  };
}

export function seededTableDoc(headers: readonly string[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [headerRow(headers), emptyDataRow(headers.length)],
      },
    ],
  };
}

export const EMPTY_DV_CONTENT: DesignVerificationSectionMap = {
  purpose_scope: { narrative: emptyDoc() },
  references: { narrative: emptyDoc() },
  traceability: { table: seededTableDoc(DV_TRACEABILITY_HEADERS) },
  test_methods: { narrative: emptyDoc() },
  test_results: { table: seededTableDoc(DV_TEST_RESULTS_HEADERS) },
  deviations: { narrative: emptyDoc() },
  conclusion: { narrative: emptyDoc() },
  approval_signoff: { narrative: emptyDoc() },
  appendices: { narrative: emptyDoc() },
};

export const DV_SECTION_LABELS: Record<
  DesignVerificationSectionKey | typeof DV_COVER_PAGE_SECTION,
  string
> = {
  cover_page: "Cover Page",
  purpose_scope: "Purpose & Scope",
  references: "References",
  traceability: "Traceability",
  test_methods: "Test Methods / Protocol Summary",
  test_results: "Test Results",
  deviations: "Deviations & Nonconformances",
  conclusion: "Conclusion",
  approval_signoff: "Approval / Sign-off",
  appendices: "Appendices",
};
