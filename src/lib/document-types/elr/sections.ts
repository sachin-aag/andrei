import type { JSONContent } from "@tiptap/core";
import { emptyDoc } from "@/lib/tiptap/rich-text";
import { seededTableDoc } from "@/lib/document-types/design-verification/sections";

/**
 * M.J. Biopharm Equipment Lifecycle Report (ELR) — the periodic consolidated
 * review of one piece of equipment since its last periodic re-qualification.
 * This is not an initial qualification protocol: MJ already issues URS / FAT /
 * SAT / IQ / OQ / PQ / RTM / VSR / PRQ per equipment. The ELR aggregates them.
 *
 * Prefix every key with `elr_`. SUGGEST_TARGET_FIELD_PATTERNS is a flat map
 * shared across types, so unprefixed keys (scope, conclusion, revision_history)
 * already belong to other types.
 */
export const ELR_SECTION_KEYS = [
  "elr_objective",
  "elr_scope",
  "elr_responsibilities",
  "elr_system_description",
  "elr_qualification",
  "elr_media_fill",
  "elr_monitoring",
  "elr_calibration",
  "elr_preventive_maintenance",
  "elr_breakdowns",
  "elr_qms",
  "elr_alarms",
  "elr_access_control",
  "elr_audit_trail",
  "elr_csv_status",
  "elr_conclusion",
  "elr_attachments",
  "elr_revision_history",
] as const;

export type ElrSectionKey = (typeof ELR_SECTION_KEYS)[number];

/** Applicability of a record when the equipment runs more than one format. */
export const ELR_FORMAT_APPLICABILITY = [
  "Vial",
  "Cartridge",
  "Line-common",
] as const;

// ---------------------------------------------------------------- table headers
// These must stay identical to the column headers rendered in
// templates/mj-equipment-lifecycle-report-template.docx.

export const ELR_RESPONSIBILITIES_HEADERS = [
  "Sr. No.",
  "Department",
  "Responsibilities",
] as const;

export const ELR_QUALIFICATION_HEADERS = [
  "Sr. No.",
  "Qualification Stage",
  "Protocol / Report No.",
  "Format Applicability",
  "Date Completed",
  "Outcome",
  "Discrepancy / QDF Ref.",
  "Next Due Date",
  "Remarks",
] as const;

export const ELR_MEDIA_FILL_HEADERS = [
  "Sr. No.",
  "Media Fill No.",
  "Format / Configuration",
  "Date",
  "Line / Shift",
  "Units Filled",
  "Contaminated Units",
  "Result",
  "Linked Deviation Ref.",
] as const;

export const ELR_MONITORING_HEADERS = [
  "Sr. No.",
  "Monitoring Parameter",
  "Period Covered",
  "Document Reference No.",
  "Result Summary",
  "Excursion (Y/N)",
  "Linked Deviation Ref.",
] as const;

export const ELR_CALIBRATION_HEADERS = [
  "Sr. No.",
  "Instrument ID / Tag",
  "Instrument Description",
  "Cal. Due Date",
  "Cal. Done Date",
  "Certificate / Doc. Ref.",
  "Result (Pass / OOT)",
  "Linked Deviation / CAPA Ref.",
] as const;

export const ELR_PREVENTIVE_MAINTENANCE_HEADERS = [
  "Sr. No.",
  "PM Checklist No.",
  "PM Frequency",
  "PM Due Date",
  "PM Completed Date",
  "Work Order / Doc. Ref.",
  "Status (On-time / Delayed)",
  "Remarks",
] as const;

export const ELR_BREAKDOWN_HEADERS = [
  "Sr. No.",
  "Date of Breakdown",
  "Document Reference",
  "Component / Failure Description",
  "Downtime (Hrs)",
  "Corrective Action Taken",
  "Format Impact",
  "Repeat (Y/N)",
  "Linked CAPA Ref.",
] as const;

export const ELR_QMS_HEADERS = [
  "Sr. No.",
  "Type (CC / Dev / CAPA / OOS / OOT)",
  "Document Reference No.",
  "Date Initiated",
  "Title / Description",
  "Format Applicability",
  "Status",
  "Date Closed",
  "Qualification Impact (Y/N)",
  "Remarks",
] as const;

export const ELR_ALARM_HEADERS = [
  "Sr. No.",
  "Alarm Code",
  "Alarm Description",
  "Criticality (DI / II)",
  "No. of Repetitions",
  "Trend Report Ref.",
  "Remediation / Action Plan Ref.",
  "Deviation / CAPA Ref.",
] as const;

export const ELR_ACCESS_CONTROL_HEADERS = [
  "Sr. No.",
  "System Name / ID",
  "User Name / ID",
  "Role / Privilege Level",
  "Action (Granted / Modified / Revoked)",
  "Date",
  "Document Reference",
] as const;

export const ELR_AUDIT_TRAIL_HEADERS = [
  "Sr. No.",
  "System Name / ID",
  "Review Period",
  "Document Reference",
  "Reviewed By",
  "Anomaly Found (Y/N)",
  "Remarks / Linked Deviation Ref.",
] as const;

export const ELR_CSV_STATUS_HEADERS = [
  "Sr. No.",
  "System Name / ID",
  "Validation Status",
  "Last Validation / Revalidation Date",
  "Document Reference",
  "Change Since Last PRQ (Y/N)",
  "Change Control Ref.",
  "Remarks",
] as const;

export const ELR_ATTACHMENTS_HEADERS = [
  "Sr. No.",
  "Attachment No.",
  "Title",
  "Document Reference No.",
  "No. of Pages",
] as const;

export const ELR_REVISION_HISTORY_HEADERS = [
  "Revision No.",
  "Effective Date",
  "Change History",
  "Change Control No.",
] as const;

// ---------------------------------------------------------------- content shapes

export type ElrNarrativeSection = { narrative: JSONContent };
export type ElrTableSection = { table: JSONContent };
export type ElrNarrativeTableSection = {
  narrative: JSONContent;
  table: JSONContent;
};
/** Breakdowns and alarms carry an extra trend-summary narrative. */
export type ElrTrendSection = {
  narrative: JSONContent;
  table: JSONContent;
  trend: JSONContent;
};

export const ELR_RECOMMENDATIONS = [
  "continue",
  "early_requalification",
  "capa",
  "other",
] as const;

export type ElrRecommendation = (typeof ELR_RECOMMENDATIONS)[number] | "";

export const ELR_RECOMMENDATION_LABELS: Record<
  (typeof ELR_RECOMMENDATIONS)[number],
  string
> = {
  continue: "Continue routine use, no action required",
  early_requalification: "Early re-qualification required",
  capa: "CAPA required",
  other: "Other (specify)",
};

export type ElrConclusionSection = {
  narrative: JSONContent;
  recommendation: ElrRecommendation;
  recommendationNarrative: JSONContent;
};

export type ElrSectionMap = {
  elr_objective: ElrNarrativeSection;
  elr_scope: ElrNarrativeSection;
  elr_responsibilities: ElrNarrativeTableSection;
  elr_system_description: ElrNarrativeSection;
  elr_qualification: ElrNarrativeTableSection;
  elr_media_fill: ElrNarrativeTableSection;
  elr_monitoring: ElrNarrativeTableSection;
  elr_calibration: ElrNarrativeTableSection;
  elr_preventive_maintenance: ElrNarrativeTableSection;
  elr_breakdowns: ElrTrendSection;
  elr_qms: ElrNarrativeTableSection;
  elr_alarms: ElrTrendSection;
  elr_access_control: ElrTableSection;
  elr_audit_trail: ElrTableSection;
  elr_csv_status: ElrNarrativeTableSection;
  elr_conclusion: ElrConclusionSection;
  elr_attachments: ElrTableSection;
  elr_revision_history: ElrTableSection;
};

/** Workspace labels. Numbered headings live only in the export template. */
export const ELR_SECTION_LABELS: Record<ElrSectionKey, string> = {
  elr_objective: "Objective",
  elr_scope: "Scope",
  elr_responsibilities: "Responsibilities",
  elr_system_description: "Equipment and System Description",
  elr_qualification: "Qualification and Periodic Re-Qualification History",
  elr_media_fill: "Media Fill / Aseptic Process Simulation",
  elr_monitoring: "Monitoring",
  elr_calibration: "Calibration of Associated Instruments",
  elr_preventive_maintenance: "Preventive Maintenance",
  elr_breakdowns: "Breakdowns and Trends",
  elr_qms: "QMS Records since Last Periodic Re-Qualification",
  elr_alarms: "Alarm Trends",
  elr_access_control: "Access Control",
  elr_audit_trail: "Audit Trail Review",
  elr_csv_status: "Computerized System Validation Status",
  elr_conclusion: "Conclusion and Recommendation",
  elr_attachments: "Attachments",
  elr_revision_history: "Revision History",
};

export const EMPTY_ELR_CONTENT: ElrSectionMap = {
  elr_objective: { narrative: emptyDoc() },
  elr_scope: { narrative: emptyDoc() },
  elr_responsibilities: {
    narrative: emptyDoc(),
    table: seededTableDoc(ELR_RESPONSIBILITIES_HEADERS),
  },
  elr_system_description: { narrative: emptyDoc() },
  elr_qualification: {
    narrative: emptyDoc(),
    table: seededTableDoc(ELR_QUALIFICATION_HEADERS),
  },
  elr_media_fill: {
    narrative: emptyDoc(),
    table: seededTableDoc(ELR_MEDIA_FILL_HEADERS),
  },
  elr_monitoring: {
    narrative: emptyDoc(),
    table: seededTableDoc(ELR_MONITORING_HEADERS),
  },
  elr_calibration: {
    narrative: emptyDoc(),
    table: seededTableDoc(ELR_CALIBRATION_HEADERS),
  },
  elr_preventive_maintenance: {
    narrative: emptyDoc(),
    table: seededTableDoc(ELR_PREVENTIVE_MAINTENANCE_HEADERS),
  },
  elr_breakdowns: {
    narrative: emptyDoc(),
    table: seededTableDoc(ELR_BREAKDOWN_HEADERS),
    trend: emptyDoc(),
  },
  elr_qms: {
    narrative: emptyDoc(),
    table: seededTableDoc(ELR_QMS_HEADERS),
  },
  elr_alarms: {
    narrative: emptyDoc(),
    table: seededTableDoc(ELR_ALARM_HEADERS),
    trend: emptyDoc(),
  },
  elr_access_control: {
    table: seededTableDoc(ELR_ACCESS_CONTROL_HEADERS),
  },
  elr_audit_trail: { table: seededTableDoc(ELR_AUDIT_TRAIL_HEADERS) },
  elr_csv_status: {
    narrative: emptyDoc(),
    table: seededTableDoc(ELR_CSV_STATUS_HEADERS),
  },
  elr_conclusion: {
    narrative: emptyDoc(),
    recommendation: "",
    recommendationNarrative: emptyDoc(),
  },
  elr_attachments: { table: seededTableDoc(ELR_ATTACHMENTS_HEADERS) },
  elr_revision_history: {
    table: seededTableDoc(ELR_REVISION_HISTORY_HEADERS),
  },
};

/**
 * Title-page identity block. Lives in `reports.metadata` rather than
 * `report_sections` — it is field data printed into the Word title page, not
 * prose. `documentNo` is the ELR report number and lives on the report row.
 */
export type ElrMetadata = {
  equipmentName: string;
  equipmentId: string;
  systemId: string;
  /**
   * Container format this ELR covers. A separate ELR is compiled per format;
   * line-level records appear in both and are marked "Line-common".
   */
  formatScope: string;
  location: string;
  department: string;
  /**
   * System Level Impact Assessment outcome — Direct / Indirect / No Impact
   * (SOP/DP/QA/014 §7.1.5). Only Direct Impact systems carry periodic
   * requalification, so this drives what the report can reasonably demand.
   */
  riskClassification: string;
  /** Review interval. PRQ frequency is set by the Validation Master Plan (§7.17.2). */
  elrFrequency: string;
  cycleNo: string;
  periodFrom: string;
  periodTo: string;
  lastPrqNo: string;
  lastPrqDate: string;
  nextPrqDate: string;
  revision: string;
};

export const ELR_DEFAULT_METADATA: ElrMetadata = {
  equipmentName: "",
  equipmentId: "",
  systemId: "",
  formatScope: "",
  location: "",
  department: "Production",
  riskClassification: "",
  elrFrequency: "",
  cycleNo: "",
  periodFrom: "",
  periodTo: "",
  lastPrqNo: "",
  lastPrqDate: "",
  nextPrqDate: "",
  revision: "R00",
};
