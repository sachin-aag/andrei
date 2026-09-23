import type { JSONContent } from "@tiptap/core";
import { emptyDoc } from "@/lib/tiptap/rich-text";
import { seededTableDoc } from "@/lib/document-types/design-verification/sections";

/**
 * M.J. Biopharm Failure Investigation Report — SOP/QA/017-F01 R01.
 *
 * This is a different form from the DMAIC investigation report the MJ pack
 * already ships (`investigation_report`, SOP/DP/QA/008, signed by QC). R01 is
 * the Drug Substance unit form: no DMAIC, signed by EU / EU / Production / QA,
 * and it carries fields the DMAIC form has no home for — initial impact,
 * root-cause classification, batch disposition, interim control, and a CAPA
 * effectiveness check. Both forms are live at MJ; neither replaces the other.
 *
 * Prefix every key with `fir_`. SUGGEST_TARGET_FIELD_PATTERNS is a flat map
 * shared across types, so unprefixed keys (scope, conclusion, attachments)
 * already belong to other types.
 */
export const FIR_SECTION_KEYS = [
  "fir_event_description",
  "fir_standard_procedures",
  "fir_immediate_action",
  "fir_initial_impact",
  "fir_investigation_team",
  "fir_investigation_tools",
  "fir_chronology",
  "fir_investigation_details",
  "fir_historic_review",
  "fir_root_cause",
  "fir_human_error",
  "fir_impact_assessment",
  "fir_scope_assessment",
  "fir_batch_disposition",
  "fir_correction",
  "fir_corrective_action",
  "fir_interim_control",
  "fir_preventive_action",
  "fir_capa_effectiveness",
  "fir_attachments",
] as const;

export type FirSectionKey = (typeof FIR_SECTION_KEYS)[number];

// ------------------------------------------------------------------- enums
// The R01 form renders each of these as a checkbox row. Storing the selection
// as an enum rather than prose is what lets the deterministic checks below
// assert that the field was actually answered.

/** R01: "Investigation Tools Assigned" checkbox row. */
export const FIR_INVESTIGATION_TOOLS = [
  "five_why",
  "six_m",
  "brainstorming",
  "cause_and_effect",
  "experimental_studies",
  "gemba_walk",
  "flow_chart",
] as const;

export type FirInvestigationTool = (typeof FIR_INVESTIGATION_TOOLS)[number];

export const FIR_INVESTIGATION_TOOL_LABELS: Record<
  FirInvestigationTool,
  string
> = {
  five_why: "5 Why",
  six_m: "6M Analysis",
  brainstorming: "Brainstorming",
  cause_and_effect: "Cause and Effect Diagram",
  experimental_studies: "Experimental Studies",
  gemba_walk: "Gemba walks / Genchi Genbutsu",
  flow_chart: "Flow Chart",
};

/** R01: "Root Cause Classification". */
export const FIR_ROOT_CAUSE_CLASSIFICATIONS = [
  "assignable_cause",
  "probable_cause",
  "root_cause",
  "no_root_cause",
] as const;

export type FirRootCauseClassification =
  (typeof FIR_ROOT_CAUSE_CLASSIFICATIONS)[number];

export const FIR_ROOT_CAUSE_CLASSIFICATION_LABELS: Record<
  FirRootCauseClassification,
  string
> = {
  assignable_cause: "Assignable Cause",
  probable_cause: "Probable Cause",
  root_cause: "Root Cause",
  no_root_cause: "No Root Cause",
};

/** R01: "Root Cause Identification Group" — the 6M categories. */
export const FIR_ROOT_CAUSE_GROUPS = [
  "man",
  "material",
  "machine",
  "method",
  "measurement",
  "milieu",
  "no_root_cause",
] as const;

export type FirRootCauseGroup = (typeof FIR_ROOT_CAUSE_GROUPS)[number];

export const FIR_ROOT_CAUSE_GROUP_LABELS: Record<FirRootCauseGroup, string> = {
  man: "Man",
  material: "Material",
  machine: "Machine",
  method: "Method",
  measurement: "Measurement",
  milieu: "Milieu",
  no_root_cause: "No Root Cause",
};

/** R01: "Batch Disposition". */
export const FIR_BATCH_DISPOSITIONS = [
  "approved",
  "rejected",
  "returned_recalled",
  "na",
] as const;

export type FirBatchDisposition = (typeof FIR_BATCH_DISPOSITIONS)[number];

export const FIR_BATCH_DISPOSITION_LABELS: Record<
  FirBatchDisposition,
  string
> = {
  approved: "Batch Approved",
  rejected: "Batch Rejected",
  returned_recalled: "Batch Returned / Recalled",
  na: "Not Applicable",
};

/**
 * Whether the impact assessment closes on complete analytical data. ERF/26/022
 * concluded "no adverse impact" while Host Cell DNA was still under testing —
 * `interim` makes that state explicit instead of letting prose hide it.
 */
export const FIR_RESULTS_STATUSES = ["final", "interim"] as const;

export type FirResultsStatus = (typeof FIR_RESULTS_STATUSES)[number];

export const FIR_RESULTS_STATUS_LABELS: Record<FirResultsStatus, string> = {
  final: "All results final",
  interim: "Interim — testing still in progress",
};

// ---------------------------------------------------------------- table headers
// These must stay identical to the column headers rendered in
// templates/mj-failure-investigation-report-template.docx. A colocated test
// asserts parity in both directions.

/** R01 and MJ's own reports both use two columns here, with no Sr. No. */
export const FIR_TEAM_HEADERS = [
  "Name",
  "Department (Role/Responsibility)",
] as const;

/**
 * R01 prescribes no chronology table; MJ's own reports use these two columns
 * and put the clock time inside the observation text rather than in a column.
 */
export const FIR_CHRONOLOGY_HEADERS = [
  "Activity / Step",
  "Observation / Details",
] as const;

/** R01 prescribes exactly these columns for the Historical Data Compilation Table. */
export const FIR_HISTORIC_REVIEW_HEADERS = [
  "Sr. No.",
  "Date",
  "Event No.",
  "Batch No.",
  "Event Details",
  "Root Cause",
  "CAPA",
] as const;

export const FIR_HUMAN_ERROR_HEADERS = [
  "Sr. No.",
  "Employee ID",
  "Error",
  "Category",
] as const;

/**
 * R01 prints "Sr No | Action Plan" only. Responsibility and Target Completion
 * Date are added here because an action list with no owner and no date cannot
 * be effectiveness-checked, and ERF/26/022 shipped eight such actions.
 */
export const FIR_ACTION_HEADERS = [
  "Sr. No.",
  "Action Plan",
  "Responsibility",
  "Target Completion Date",
  "Reference / Change Control No.",
] as const;

/**
 * R01 prints one merged "Details/Criteria/duration/Remarks" column. Splitting
 * it lets the deterministic check assert that a criterion and a duration were
 * both actually recorded.
 */
export const FIR_CAPA_EFFECTIVENESS_HEADERS = [
  "Sr. No.",
  "Activity",
  "Acceptance Criteria",
  "Duration",
  "Responsibility",
  "Remarks",
] as const;

export const FIR_ATTACHMENT_HEADERS = [
  "Attachment No.",
  "Description",
  "Document Reference No.",
  "No. of Pages",
] as const;

// -------------------------------------------------------------- section shapes

export type FirNarrativeSection = { narrative: JSONContent };
export type FirTableSection = { table: JSONContent };
export type FirNarrativeTableSection = {
  narrative: JSONContent;
  table: JSONContent;
};

export type FirInvestigationToolsSection = {
  tools: FirInvestigationTool[];
  /** Tools not on the R01 list. Adds to the selection; never replaces it. */
  narrative: JSONContent;
};

export type FirRootCauseSection = {
  classification: FirRootCauseClassification | "";
  groups: FirRootCauseGroup[];
  narrative: JSONContent;
};

export type FirHumanErrorSection = {
  /** "" until answered; "no" records an explicit NA rather than a blank grid. */
  applicable: "yes" | "no" | "";
  table: JSONContent;
};

export type FirImpactAssessmentSection = {
  resultsStatus: FirResultsStatus | "";
  narrative: JSONContent;
};

export type FirBatchDispositionSection = {
  disposition: FirBatchDisposition | "";
  narrative: JSONContent;
};

export type FirSectionMap = {
  fir_event_description: FirNarrativeSection;
  fir_standard_procedures: FirNarrativeSection;
  fir_immediate_action: FirNarrativeSection;
  fir_initial_impact: FirNarrativeSection;
  fir_investigation_team: FirTableSection;
  fir_investigation_tools: FirInvestigationToolsSection;
  fir_chronology: FirNarrativeTableSection;
  fir_investigation_details: FirNarrativeSection;
  fir_historic_review: FirNarrativeTableSection;
  fir_root_cause: FirRootCauseSection;
  fir_human_error: FirHumanErrorSection;
  fir_impact_assessment: FirImpactAssessmentSection;
  fir_scope_assessment: FirNarrativeSection;
  fir_batch_disposition: FirBatchDispositionSection;
  fir_correction: FirNarrativeSection;
  fir_corrective_action: FirNarrativeTableSection;
  fir_interim_control: FirNarrativeTableSection;
  fir_preventive_action: FirNarrativeTableSection;
  fir_capa_effectiveness: FirTableSection;
  fir_attachments: FirTableSection;
};

export const FIR_SECTION_LABELS: Record<FirSectionKey, string> = {
  fir_event_description: "Description of Event",
  fir_standard_procedures: "Standard Procedures",
  fir_immediate_action: "Immediate Action Taken",
  fir_initial_impact: "Initial Impact Assessment",
  fir_investigation_team: "Investigation Team",
  fir_investigation_tools: "Investigation Tools Assigned",
  fir_chronology: "Chronology of the Event",
  fir_investigation_details: "Investigation Details",
  fir_historic_review: "Historic Review",
  fir_root_cause: "Root Cause / Probable Cause",
  fir_human_error: "Human Error Evaluation",
  fir_impact_assessment: "Impact Assessment",
  fir_scope_assessment: "Scope Assessment",
  fir_batch_disposition: "Batch Disposition",
  fir_correction: "Correction Details",
  fir_corrective_action: "Corrective Action",
  fir_interim_control: "Interim Control",
  fir_preventive_action: "Preventive Action",
  fir_capa_effectiveness: "CAPA Effectiveness Check",
  fir_attachments: "List of Attachments",
};

export const EMPTY_FIR_CONTENT: FirSectionMap = {
  fir_event_description: { narrative: emptyDoc() },
  fir_standard_procedures: { narrative: emptyDoc() },
  fir_immediate_action: { narrative: emptyDoc() },
  fir_initial_impact: { narrative: emptyDoc() },
  fir_investigation_team: { table: seededTableDoc(FIR_TEAM_HEADERS) },
  fir_investigation_tools: { tools: [], narrative: emptyDoc() },
  fir_chronology: {
    narrative: emptyDoc(),
    table: seededTableDoc(FIR_CHRONOLOGY_HEADERS),
  },
  fir_investigation_details: { narrative: emptyDoc() },
  fir_historic_review: {
    narrative: emptyDoc(),
    table: seededTableDoc(FIR_HISTORIC_REVIEW_HEADERS),
  },
  fir_root_cause: { classification: "", groups: [], narrative: emptyDoc() },
  fir_human_error: {
    applicable: "",
    table: seededTableDoc(FIR_HUMAN_ERROR_HEADERS),
  },
  fir_impact_assessment: { resultsStatus: "", narrative: emptyDoc() },
  fir_scope_assessment: { narrative: emptyDoc() },
  fir_batch_disposition: { disposition: "", narrative: emptyDoc() },
  fir_correction: { narrative: emptyDoc() },
  fir_corrective_action: {
    narrative: emptyDoc(),
    table: seededTableDoc(FIR_ACTION_HEADERS),
  },
  fir_interim_control: {
    narrative: emptyDoc(),
    table: seededTableDoc(FIR_ACTION_HEADERS),
  },
  fir_preventive_action: {
    narrative: emptyDoc(),
    table: seededTableDoc(FIR_ACTION_HEADERS),
  },
  fir_capa_effectiveness: {
    table: seededTableDoc(FIR_CAPA_EFFECTIVENESS_HEADERS),
  },
  fir_attachments: { table: seededTableDoc(FIR_ATTACHMENT_HEADERS) },
};

/**
 * Identity block. Lives in `reports.metadata`, not `report_sections` — the R01
 * header fields are single values, not editable prose. Unset fields are still
 * listed in the chat context map so the model cannot invent them from the
 * first attachment hit.
 */
export type FirMetadata = {
  unit: string;
  dateOfNonConformance: string;
  sourceDocumentNo: string;
  productName: string;
  batchNo: string;
  equipmentId: string;
  referenceSopNo: string;
};

export const FIR_DEFAULT_METADATA: FirMetadata = {
  unit: "Drug Substance",
  dateOfNonConformance: "",
  sourceDocumentNo: "",
  productName: "",
  batchNo: "",
  equipmentId: "",
  referenceSopNo: "SOP/QA/017",
};

/** Sections whose action tables are effectiveness-checkable. */
export const FIR_ACTION_SECTIONS = [
  "fir_corrective_action",
  "fir_interim_control",
  "fir_preventive_action",
] as const satisfies readonly FirSectionKey[];
