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
