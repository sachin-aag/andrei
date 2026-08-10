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

/** Sections whose TipTap field is a fixed-header matrix (`content.table`). */
export const DV_TABLE_SECTIONS = ["traceability", "test_results"] as const;

export type DvTableSectionKey = (typeof DV_TABLE_SECTIONS)[number];

export function isDvTableSection(section: string): section is DvTableSectionKey {
  return (DV_TABLE_SECTIONS as readonly string[]).includes(section);
}

export function dvTableHeadersForSection(
  section: DvTableSectionKey
): readonly string[] {
  switch (section) {
    case "traceability":
      return DV_TRACEABILITY_HEADERS;
    case "test_results":
      return DV_TEST_RESULTS_HEADERS;
    default: {
      const _exhaustive: never = section;
      return _exhaustive;
    }
  }
}

function gfmHeaderExample(headers: readonly string[]): string {
  const cells = headers.join(" | ");
  const sep = headers.map(() => "---").join(" | ");
  return `| ${cells} |\n| ${sep} |`;
}

/**
 * Prompt block telling chat / suggest models to keep seeded matrix columns.
 * Shared by chat draftingGuidance and suggest-fix prompts.
 */
export function dvFixedTableFormatGuidance(opts?: {
  /** When set, only describe that section's schema. */
  section?: DvTableSectionKey;
  /** "chat" mentions draft_field; "suggest" mentions cell-level edits. */
  surface?: "chat" | "suggest";
}): string {
  const surface = opts?.surface ?? "chat";
  const sections: DvTableSectionKey[] = opts?.section
    ? [opts.section]
    : [...DV_TABLE_SECTIONS];

  const schemas = sections
    .map((key) => {
      const label = DV_SECTION_LABELS[key];
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

  return `## Fixed table formats (required)
${sections.length === 1 ? "This section" : "These sections"} use a seeded TipTap matrix with a fixed column schema. Stick to that format.

${surfaceRules}

${schemas}`;
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
  cover_page: "Cover Page & Document Control",
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
