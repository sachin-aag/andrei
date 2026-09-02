import type { JSONContent } from "@tiptap/core";
import { emptyDoc } from "@/lib/tiptap/rich-text";
import {
  CONVERGENT_EQUIPMENT_HEADERS,
  seededTableDoc,
} from "@/lib/document-types/design-verification/sections";

/**
 * Section keys for the Convergent mechanical/hardware DV report, derived from
 * the Mechanical DV Report Recipe (itself derived from 825-00101 Rev. A against
 * Verification Test Report Template 731-00008 Rev. B).
 *
 * The recipe's numbered subsections each become their own section so every one
 * carries its own traffic light and criteria block. Three things differ from
 * the software DV report and drive this shape:
 *   - sections are numbered, with decimal subsections;
 *   - a single pair of protocol executions, so no per-revision execution blocks;
 *   - method deviations (2.2) are separate from failures (3).
 */
export const MECHANICAL_DV_SECTION_KEYS = [
  "purpose",
  "scope",
  "testers_dates",
  "executed_protocol",
  "protocol_deviations",
  "units_under_test",
  "equipment_and_calibration",
  "failure_forms",
  "data_collection_forms",
  "requirements_verified",
  "observations",
  "problems_resolution",
  "conclusion",
  "revision_history",
] as const;

export type MechanicalDvSectionKey =
  (typeof MECHANICAL_DV_SECTION_KEYS)[number];

/** Table 1 (2.3) — one row per physical unit used, identified by serial number. */
export const MECHANICAL_UUT_HEADERS = [
  "Equipment",
  "Manufacturer",
  "Part Number",
  "Serial Number",
  "Revision",
] as const;

/**
 * Tables 3 and 4 (4.2). Notes/Results carries a datasheet pointer, a
 * cross-reference, or a not-applicable statement; Pass/Fail carries Pass, Fail
 * or N/A only.
 */
export const MECHANICAL_RESULTS_HEADERS = [
  "Req ID",
  "Requirement Description",
  "Notes/Results",
  "Pass/Fail",
] as const;

/** Landscape tblGrid shares so Req ID and Pass/Fail stay on one line. */
export const MECHANICAL_RESULTS_COL_WIDTH_SHARES = [16, 42, 28, 14] as const;

/** Table 5 — one row per revision of the report, oldest at the top. */
export const MECHANICAL_REVISION_HISTORY_HEADERS = [
  "Revision Level",
  "Revision Date",
  "DCO/ECO Number",
  "Description of Revision",
  "Revision Author",
] as const;

export type MechanicalNarrativeSection = {
  narrative: JSONContent;
};

export type MechanicalTestersSection = {
  testers: JSONContent;
};

export type MechanicalNarrativeTableSection = {
  narrative: JSONContent;
  table: JSONContent;
};

/** 4.2 carries one results table per discipline, hardware first. */
export type MechanicalRequirementsVerifiedSection = {
  narrative: JSONContent;
  hardwareTable: JSONContent;
  systemTable: JSONContent;
};

export type MechanicalTableSection = {
  table: JSONContent;
};

export type MechanicalDvSectionMap = {
  purpose: MechanicalNarrativeSection;
  scope: MechanicalNarrativeSection;
  testers_dates: MechanicalTestersSection;
  executed_protocol: MechanicalNarrativeSection;
  protocol_deviations: MechanicalNarrativeSection;
  units_under_test: MechanicalNarrativeTableSection;
  equipment_and_calibration: MechanicalNarrativeTableSection;
  failure_forms: MechanicalNarrativeSection;
  data_collection_forms: MechanicalNarrativeSection;
  requirements_verified: MechanicalRequirementsVerifiedSection;
  observations: MechanicalNarrativeSection;
  problems_resolution: MechanicalNarrativeSection;
  conclusion: MechanicalNarrativeSection;
  revision_history: MechanicalTableSection;
};

/** Workspace labels. Numbered headings (2.1, 4.3, …) live only in the export template. */
export const MECHANICAL_DV_SECTION_LABELS: Record<
  MechanicalDvSectionKey,
  string
> = {
  purpose: "Purpose",
  scope: "Scope",
  testers_dates: "Testers/Dates",
  executed_protocol: "Executed Protocol",
  protocol_deviations: "Protocol Deviations",
  units_under_test: "Units Under Test",
  equipment_and_calibration: "Test Equipment",
  failure_forms: "Failure/Out of Specification Forms",
  data_collection_forms: "Data Collection Forms",
  requirements_verified: "Requirements Verified",
  observations: "Observations",
  problems_resolution: "Problem or Failure Resolution",
  conclusion: "Conclusion",
  revision_history: "Revision History",
};

export const EMPTY_MECHANICAL_DV_CONTENT: MechanicalDvSectionMap = {
  purpose: { narrative: emptyDoc() },
  scope: { narrative: emptyDoc() },
  testers_dates: { testers: emptyDoc() },
  executed_protocol: { narrative: emptyDoc() },
  protocol_deviations: { narrative: emptyDoc() },
  units_under_test: {
    narrative: emptyDoc(),
    table: seededTableDoc(MECHANICAL_UUT_HEADERS),
  },
  equipment_and_calibration: {
    narrative: emptyDoc(),
    table: seededTableDoc(CONVERGENT_EQUIPMENT_HEADERS),
  },
  failure_forms: { narrative: emptyDoc() },
  data_collection_forms: { narrative: emptyDoc() },
  requirements_verified: {
    narrative: emptyDoc(),
    hardwareTable: seededTableDoc(MECHANICAL_RESULTS_HEADERS),
    systemTable: seededTableDoc(MECHANICAL_RESULTS_HEADERS),
  },
  observations: { narrative: emptyDoc() },
  problems_resolution: { narrative: emptyDoc() },
  conclusion: { narrative: emptyDoc() },
  revision_history: {
    table: seededTableDoc(MECHANICAL_REVISION_HISTORY_HEADERS),
  },
};

/**
 * The recipe's report identity block. Lives in `reports.metadata` rather than
 * `report_sections` — it is four fields plus running header/footer, not prose.
 */
export type MechanicalDvMetadata = {
  productName: string;
  projectName: string;
  projectLeader: string;
  dhfIndexNo: string;
  ecoDcoNo: string;
  revision: string;
  templateNo: string;
};

export const MECHANICAL_DV_DEFAULT_METADATA: MechanicalDvMetadata = {
  productName: "",
  projectName: "",
  projectLeader: "",
  dhfIndexNo: "",
  ecoDcoNo: "",
  revision: "",
  templateNo: "731-00008 Rev. B",
};
