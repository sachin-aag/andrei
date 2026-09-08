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
  "elr_reconciliation",
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

export const ELR_RECONCILIATION_HEADERS = [
  "Sr. No.",
  "Reconciliation Check",
  "Section Ref.",
  "Outcome (Complies / Gap)",
  "Gap Description",
  "Action Required",
  "Responsibility / TCD",
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

/**
 * Section 15 ships pre-filled. These are the standing cross-reference checks —
 * a compiler answers each one rather than inventing the list, so a gap is a
 * finding for the conclusion rather than a silently missing row.
 */
export const ELR_RECONCILIATION_CHECKS: readonly {
  check: string;
  sectionRef: string;
}[] = [
  {
    check: "Every monitoring excursion has a linked deviation record",
    sectionRef: "7, 11",
  },
  {
    check: "No calibration overdue as on the ELR cut-off date",
    sectionRef: "8",
  },
  {
    check: "PM compliance computed; every delayed or missed PM justified",
    sectionRef: "9",
  },
  {
    check: "Every repeat breakdown failure mode has a linked CAPA",
    sectionRef: "10, 11",
  },
  {
    check:
      "Every change control with qualification impact 'Yes' has a corresponding qualification activity",
    sectionRef: "11, 5",
  },
  {
    check:
      "Every Direct Impact alarm has a linked deviation or a documented action-plan reference",
    sectionRef: "12, 11",
  },
  {
    check:
      "The set of alarm codes under trend remains appropriate to the equipment's direct-impact functions",
    sectionRef: "12",
  },
  { check: "No lapse in audit trail review periods", sectionRef: "13.2" },
  {
    check: "Computerized system periodic review has not lapsed",
    sectionRef: "14",
  },
  {
    check: "PRQ sequence unbroken and next PRQ not overdue",
    sectionRef: "5",
  },
  {
    check: "Media fill coverage current for this container format",
    sectionRef: "6",
  },
  {
    check:
      "Line-common records reported consistently in the counterpart container-format ELR",
    sectionRef: "5, 11, 12, 13, 14",
  },
];

// ---------------------------------------------------------------- content shapes

export type ElrNarrativeSection = { narrative: JSONContent };
export type ElrTableSection = { table: JSONContent };
export type ElrNarrativeTableSection = {
  narrative: JSONContent;
  table: JSONContent;
};
/** Breakdowns and alarms carry an extra trend narrative (10.1 / 12.1). */
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
  elr_reconciliation: ElrTableSection;
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
  elr_reconciliation: "Cross-Reference Reconciliation and Gap Summary",
  elr_conclusion: "Conclusion and Recommendation",
  elr_attachments: "Attachments",
  elr_revision_history: "Revision History",
};

function textCell(text: string): JSONContent {
  return {
    type: "tableCell",
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [
      {
        type: "paragraph",
        ...(text ? { content: [{ type: "text", text }] } : {}),
      },
    ],
  };
}

/** Section 15 with its standing checks already populated. */
function seededReconciliation(): JSONContent {
  const doc = seededTableDoc(ELR_RECONCILIATION_HEADERS);
  const table = doc.content?.[0];
  if (!table) return doc;
  table.content = [
    table.content?.[0] as JSONContent,
    ...ELR_RECONCILIATION_CHECKS.map((row, index) => ({
      type: "tableRow",
      content: [
        textCell(String(index + 1)),
        textCell(row.check),
        textCell(row.sectionRef),
        textCell(""),
        textCell(""),
        textCell(""),
        textCell(""),
      ],
    })),
  ];
  return doc;
}

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
  elr_reconciliation: { table: seededReconciliation() },
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
  /** Drives the review interval — the ELR frequency is risk-based, not fixed. */
  riskClassification: string;
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
