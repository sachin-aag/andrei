import type { JSONContent } from "@tiptap/core";
import { emptyDoc } from "@/lib/tiptap/rich-text";
import { seededTableDoc } from "@/lib/document-types/design-verification/sections";
import type { Ledger, ModificationRow } from "@/lib/design-inputs/types";
import { EMPTY_LEDGER } from "@/lib/document-types/verification-protocol/sections";

export const TEST_REPORT_COVER_PAGE_SECTION = "cover_page" as const;

export const TEST_REPORT_SECTION_KEYS = [
  "design_inputs",
  "purpose",
  "scope",
  "software_under_test",
  "testers_dates",
  "methods_of_measurement",
  "deviations",
  "results_discussion",
  "problem_failure_resolution",
  "conclusion",
  "revision_history",
] as const;

export type TestReportSectionKey = (typeof TEST_REPORT_SECTION_KEYS)[number];

export type TestReportNarrativeSection = {
  narrative: JSONContent;
};

export type TestReportTableSection = {
  table: JSONContent;
};

export type TestReportDeviationItem = {
  id: string;
  number: string;
  reqIds: string;
  observation: string;
  rationale: string;
  resolution: string;
  jira: string;
};

export type TestReportDeviationsSection = {
  items: TestReportDeviationItem[];
};

export type ProtocolModificationsSnapshot = {
  sourceProtocolReportId: string;
  pulledAt: string;
  rows: ModificationRow[];
};

export type TestReportMethodsSection = {
  executedProtocol: JSONContent;
  protocolModifications: ProtocolModificationsSnapshot | null;
  uuts: JSONContent;
  equipment: JSONContent;
};

export type TestReportResultsSection = {
  observations: JSONContent;
};

export type TestReportSectionMap = {
  design_inputs: Ledger;
  purpose: TestReportNarrativeSection;
  scope: TestReportNarrativeSection;
  software_under_test: TestReportTableSection;
  testers_dates: TestReportNarrativeSection;
  methods_of_measurement: TestReportMethodsSection;
  deviations: TestReportDeviationsSection;
  results_discussion: TestReportResultsSection;
  problem_failure_resolution: TestReportNarrativeSection;
  conclusion: TestReportNarrativeSection;
  revision_history: TestReportTableSection;
};

export const SOFTWARE_UNDER_TEST_HEADERS = [
  "Version",
  "Reason for build",
] as const;

export const EQUIPMENT_HEADERS = [
  "Equipment",
  "Manufacturer",
  "Model / Part No.",
  "CD Asset Tag / Serial No.",
  "Calibration Due",
] as const;

export const REVISION_HISTORY_HEADERS = [
  "Rev",
  "DCO/ECO",
  "Description",
] as const;

export const EMPTY_TEST_REPORT_METHODS: TestReportMethodsSection = {
  executedProtocol: emptyDoc(),
  protocolModifications: null,
  uuts: emptyDoc(),
  equipment: seededTableDoc(EQUIPMENT_HEADERS),
};

export const EMPTY_TEST_REPORT_CONTENT: TestReportSectionMap = {
  design_inputs: EMPTY_LEDGER,
  purpose: { narrative: emptyDoc() },
  scope: { narrative: emptyDoc() },
  software_under_test: { table: seededTableDoc(SOFTWARE_UNDER_TEST_HEADERS) },
  testers_dates: { narrative: emptyDoc() },
  methods_of_measurement: { ...EMPTY_TEST_REPORT_METHODS },
  deviations: { items: [] },
  results_discussion: { observations: emptyDoc() },
  problem_failure_resolution: { narrative: emptyDoc() },
  conclusion: { narrative: emptyDoc() },
  revision_history: { table: seededTableDoc(REVISION_HISTORY_HEADERS) },
};

export const TEST_REPORT_SECTION_LABELS: Record<
  TestReportSectionKey | typeof TEST_REPORT_COVER_PAGE_SECTION,
  string
> = {
  cover_page: "Cover Page",
  design_inputs: "Design Inputs",
  purpose: "Purpose",
  scope: "Scope",
  software_under_test: "Software Under Test",
  testers_dates: "Testers / Dates",
  methods_of_measurement: "Methods of Measurement",
  deviations: "Deviations",
  results_discussion: "Results and Discussion",
  problem_failure_resolution: "Problem or Failure Resolution",
  conclusion: "Conclusion",
  revision_history: "Revision History",
};

function asDoc(value: unknown, fallback: JSONContent): JSONContent {
  if (
    value &&
    typeof value === "object" &&
    (value as JSONContent).type === "doc"
  ) {
    return value as JSONContent;
  }
  return fallback;
}

export function asTestReportNarrative(raw: unknown): TestReportNarrativeSection {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { narrative: asDoc(o.narrative, emptyDoc()) };
}

export function asTestReportTable(
  raw: unknown,
  headers: readonly string[]
): TestReportTableSection {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { table: asDoc(o.table, seededTableDoc(headers)) };
}

export function asTestReportDeviations(raw: unknown): TestReportDeviationsSection {
  if (!raw || typeof raw !== "object") return { items: [] };
  const items = (raw as TestReportDeviationsSection).items;
  if (!Array.isArray(items)) return { items: [] };
  return {
    items: items.map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      number: typeof item.number === "string" ? item.number : "",
      reqIds: typeof item.reqIds === "string" ? item.reqIds : "",
      observation: typeof item.observation === "string" ? item.observation : "",
      rationale: typeof item.rationale === "string" ? item.rationale : "",
      resolution: typeof item.resolution === "string" ? item.resolution : "",
      jira: typeof item.jira === "string" ? item.jira : "",
    })),
  };
}

export function asProtocolModificationsSnapshot(
  raw: unknown
): ProtocolModificationsSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<ProtocolModificationsSnapshot>;
  if (typeof o.sourceProtocolReportId !== "string" || !o.sourceProtocolReportId) {
    return null;
  }
  return {
    sourceProtocolReportId: o.sourceProtocolReportId,
    pulledAt: typeof o.pulledAt === "string" ? o.pulledAt : "",
    rows: Array.isArray(o.rows) ? o.rows : [],
  };
}

export function asTestReportMethods(raw: unknown): TestReportMethodsSection {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    executedProtocol: asDoc(
      o.executedProtocol,
      EMPTY_TEST_REPORT_METHODS.executedProtocol
    ),
    protocolModifications: asProtocolModificationsSnapshot(
      o.protocolModifications
    ),
    uuts: asDoc(o.uuts, EMPTY_TEST_REPORT_METHODS.uuts),
    equipment: asDoc(o.equipment, EMPTY_TEST_REPORT_METHODS.equipment),
  };
}

export function asTestReportResults(raw: unknown): TestReportResultsSection {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { observations: asDoc(o.observations, emptyDoc()) };
}
