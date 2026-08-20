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
  "Model/Part No.",
  "CD Asset Tag / Serial No.",
  "Calibration Due",
] as const;

export const CONVERGENT_RESULTS_HEADERS = [
  "Req ID",
  "Req Description",
  "Satisfied By",
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

/** How to fill Convergent Results and Discussions P/F rows (chat + suggest). */
export const CONVERGENT_RESULTS_MATRIX_FILLING_NOTES = `Results and Discussions P/F table — column filling:
- P/F: write only Pass or Fail (or P/F). That cell is the verdict, not the configuration.
- Satisfied By MUST include both (1) the method, procedure, datasheet, or evidence that satisfied the requirement and (2) the configuration for which that P/F was achieved (UUT / software version / TOP or PCON / fixture / execution). Example: "TOP-00051 datasheets — TOP-00017 PCON (SW 4.7.1)".
- If the same requirement was run on more than one configuration, name each configuration in Satisfied By so the verdict is attributable. Keep one row per Req ID.
- Do not invent a configuration. If evidence does not name one, use a bracketed placeholder like [configuration].`;

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

  const surfaceRules =
    surface === "chat"
      ? `- When drafting or rewriting these sections via draft_field, emit ONE GFM markdown table only (header + separator + data rows). Do not wrap the table in prose paragraphs.
- Use EXACTLY the headers below, in this order — never rename, reorder, add, or drop columns.
- If the section already has a table, preserve its header row verbatim and only update or add data rows.
- Fill known cells; use bracketed placeholders like [requirement ID] for unknowns. Leave optional cells blank rather than inventing new columns.`
      : `- targetField MUST be "table".
- Preserve the existing column headers exactly — never rename, reorder, add, or drop columns.
- Prefer minimal cell-value edits (anchorText from SECTION CONTENT). Do not rewrite the matrix into a different column layout or free-form prose.
- If filling a gap requires new rows, keep the same header set and column order.`;

  const fillingNotes = sections.includes("results_and_discussions")
    ? `\n\n${CONVERGENT_RESULTS_MATRIX_FILLING_NOTES}`
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
