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
  "elr_abbreviations",
  "elr_system_description",
  "elr_qualification",
  "elr_media_fill",
  "elr_monitoring",
  "elr_calibration",
  "elr_preventive_maintenance",
  "elr_alarms",
  "elr_breakdowns",
  "elr_qms",
  "elr_access_control",
  "elr_audit_trail",
  "elr_csv_status",
  "elr_discrepancies",
  "elr_system_trends",
  "elr_risk_actions",
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

export const ELR_ABBREVIATIONS_HEADERS = [
  "Abbreviation",
  "Expansion",
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
  "Task",
  "Operator",
  "Supervisor",
  "Maintenance",
  "Administrator",
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
  "Revalidation Due Date",
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

export const ELR_SYSTEM_TRENDS_HEADERS = [
  "Sr. No.",
  "Section",
  "Summary",
  "Trend (increasing / stable / decreasing / none)",
  "Product or runtime impact",
  "Carried to risk (Risk ID)",
] as const;

export type ElrSectionRecapSource = {
  key: ElrSectionKey;
  number: string;
  label: string;
};

/**
 * 5.1 table recap of every Observations subsection and Discrepancy.
 * Purpose (1.0) and Scope (2.0) are omitted on purpose. 3.9.1 / 3.10.1
 * stay inside 3.9 / 3.10 rather than extra rows.
 */
export const ELR_TREND_RECAP_SOURCES: readonly ElrSectionRecapSource[] = [
  { key: "elr_responsibilities", number: "3.1", label: "Responsibilities" },
  { key: "elr_abbreviations", number: "3.2", label: "Abbreviations" },
  {
    key: "elr_system_description",
    number: "3.3",
    label: "Equipment and System Description",
  },
  {
    key: "elr_qualification",
    number: "3.4",
    label: "Qualification and Periodic Re-Qualification History",
  },
  {
    key: "elr_media_fill",
    number: "3.5",
    label: "Media Fill / Aseptic Process Simulation",
  },
  { key: "elr_monitoring", number: "3.6", label: "Monitoring" },
  {
    key: "elr_calibration",
    number: "3.7",
    label: "Calibration of Associated Instruments",
  },
  {
    key: "elr_preventive_maintenance",
    number: "3.8",
    label: "Preventive Maintenance",
  },
  { key: "elr_alarms", number: "3.9", label: "Alarm Trends" },
  { key: "elr_breakdowns", number: "3.10", label: "Breakdowns and Trends" },
  {
    key: "elr_qms",
    number: "3.11",
    label: "QMS Records since Last Periodic Re-Qualification",
  },
  { key: "elr_access_control", number: "3.12", label: "Access Control" },
  { key: "elr_audit_trail", number: "3.13", label: "Audit Trail Review" },
  {
    key: "elr_csv_status",
    number: "3.14",
    label: "Computerized System Validation Status",
  },
  { key: "elr_discrepancies", number: "4.0", label: "Discrepancy / Deviations" },
];

/** 5.3 also recaps 5.1 and 5.2 before the qualified-state decision. */
export const ELR_CONCLUSION_RECAP_SOURCES: readonly ElrSectionRecapSource[] = [
  ...ELR_TREND_RECAP_SOURCES,
  {
    key: "elr_system_trends",
    number: "5.1",
    label: "System Trends and Patterns",
  },
  {
    key: "elr_risk_actions",
    number: "5.2",
    label: "Risk Assessment and Prioritized Actions",
  },
];

/** Seeded 5.1 rows and filled recap cells must carry at least this much summary. */
export const ELR_RECAP_MIN_SUMMARY_CHARS = 12;

/**
 * Match a 5.1 Section cell or a 5.3 bullet to a recap source. Prefer the
 * first numbered heading (`3.6`, `4.0`) so "monitoring" in an Alarm Trends
 * bullet cannot steal 3.6. `3.9.1` still belongs to 3.9; `3.10.1` to 3.10.
 */
export function recapSourceMatchesText(
  source: ElrSectionRecapSource,
  text: string
): boolean {
  const hay = text.replace(/\s+/g, " ").trim();
  if (!hay) return false;
  const numbered = /(?:^|\s)(\d+\.\d+)(?!\d)/.exec(hay);
  if (numbered) return numbered[1] === source.number;
  return hay.toLowerCase().includes(source.label.toLowerCase());
}

export const ELR_RISK_ACTION_HEADERS = [
  "Sr. No.",
  "Risk",
  "Source (section / records)",
  "Occurrence in period",
  "Severity",
  "Priority (High / Medium / Low)",
  "Recommended action",
  "Action type (CAPA / PM revision / change control / monitoring)",
  "Owner",
  "Target date",
  "Reference",
] as const;

/** Soft cap on the risk-actions table — consolidate related rows rather than list every event. */
export const ELR_RISK_ACTION_MAX_ROWS = 15;

/** Caption titles — keep identical to the editor table labels. */
export const ELR_TABLE_CAPTION_TITLES = {
  elr_responsibilities: "Departments and responsibilities",
  elr_abbreviations: "Abbreviations",
  elr_qualification: "Qualification and periodic re-qualification history",
  elr_media_fill: "Media fill / aseptic process simulation",
  elr_monitoring: "Monitoring records",
  elr_calibration: "Associated instruments",
  elr_preventive_maintenance: "Preventive maintenance",
  elr_breakdowns: "Breakdown events",
  elr_qms: "Change control / deviation / CAPA / OOS / OOT",
  elr_alarms: "Alarm records",
  elr_access_control: "Access control",
  elr_audit_trail: "Audit trail review",
  elr_csv_status: "Validation status",
  elr_system_trends: "Section summaries",
  elr_risk_actions: "Prioritized actions",
  elr_attachments: "Attachments",
  elr_revision_history: "Revision history",
} as const satisfies Partial<Record<ElrSectionKey, string>>;

const ELR_TABLE_HEADERS: Partial<Record<ElrSectionKey, readonly string[]>> = {
  elr_responsibilities: ELR_RESPONSIBILITIES_HEADERS,
  elr_abbreviations: ELR_ABBREVIATIONS_HEADERS,
  elr_qualification: ELR_QUALIFICATION_HEADERS,
  elr_media_fill: ELR_MEDIA_FILL_HEADERS,
  elr_monitoring: ELR_MONITORING_HEADERS,
  elr_calibration: ELR_CALIBRATION_HEADERS,
  elr_preventive_maintenance: ELR_PREVENTIVE_MAINTENANCE_HEADERS,
  elr_breakdowns: ELR_BREAKDOWN_HEADERS,
  elr_qms: ELR_QMS_HEADERS,
  elr_alarms: ELR_ALARM_HEADERS,
  elr_access_control: ELR_ACCESS_CONTROL_HEADERS,
  elr_audit_trail: ELR_AUDIT_TRAIL_HEADERS,
  elr_csv_status: ELR_CSV_STATUS_HEADERS,
  elr_system_trends: ELR_SYSTEM_TRENDS_HEADERS,
  elr_risk_actions: ELR_RISK_ACTION_HEADERS,
  elr_attachments: ELR_ATTACHMENTS_HEADERS,
  elr_revision_history: ELR_REVISION_HISTORY_HEADERS,
};

export function elrTableHeadersForSection(section: string): readonly string[] {
  return ELR_TABLE_HEADERS[section as ElrSectionKey] ?? [];
}

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

export const ELR_RISK_GRADES = ["low", "medium", "high"] as const;

export type ElrRiskGrade = (typeof ELR_RISK_GRADES)[number] | "";

export const ELR_RISK_GRADE_LABELS: Record<
  (typeof ELR_RISK_GRADES)[number],
  string
> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

export type ElrRiskActionsSection = {
  narrative: JSONContent;
  table: JSONContent;
  overallGrade: ElrRiskGrade;
};

export type ElrSectionMap = {
  elr_objective: ElrNarrativeSection;
  elr_scope: ElrNarrativeSection;
  elr_responsibilities: ElrNarrativeTableSection;
  elr_abbreviations: ElrTableSection;
  elr_system_description: ElrNarrativeSection;
  elr_qualification: ElrNarrativeTableSection;
  elr_media_fill: ElrNarrativeTableSection;
  elr_monitoring: ElrNarrativeTableSection;
  elr_calibration: ElrNarrativeTableSection;
  elr_preventive_maintenance: ElrNarrativeTableSection;
  elr_breakdowns: ElrTrendSection;
  elr_qms: ElrNarrativeTableSection;
  elr_alarms: ElrTrendSection;
  elr_access_control: ElrNarrativeTableSection;
  elr_audit_trail: ElrNarrativeTableSection;
  elr_csv_status: ElrNarrativeTableSection;
  elr_discrepancies: ElrNarrativeSection;
  elr_system_trends: ElrNarrativeTableSection;
  elr_risk_actions: ElrRiskActionsSection;
  elr_conclusion: ElrConclusionSection;
  elr_attachments: ElrTableSection;
  elr_revision_history: ElrTableSection;
};

/** Workspace labels. Numbered headings live only in the export template. */
export const ELR_SECTION_LABELS: Record<ElrSectionKey, string> = {
  elr_objective: "Purpose",
  elr_scope: "Scope",
  elr_responsibilities: "Responsibilities",
  elr_abbreviations: "Abbreviations",
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
  elr_discrepancies: "Discrepancy / Deviations",
  elr_system_trends: "System Trends and Patterns",
  elr_risk_actions: "Risk Assessment and Prioritized Actions",
  elr_conclusion: "Summary, Conclusion and Recommendation",
  elr_attachments: "Attachments",
  elr_revision_history: "Revision History",
};

/**
 * Starter glossary. Every MJ document carries an abbreviations block (F10 §3.2,
 * F09 §5.0). This is boilerplate the compiler prunes, not a set of judgments —
 * no criterion enforces any particular row.
 */
const ELR_STARTER_ABBREVIATIONS: readonly (readonly [string, string])[] = [
  ["APS", "Aseptic Process Simulation"],
  ["CAPA", "Corrective Action and Preventive Action"],
  ["CC", "Change Control"],
  ["CSV", "Computerized System Validation"],
  ["ELR", "Equipment Lifecycle Report"],
  ["IQ / OQ / PQ", "Installation / Operational / Performance Qualification"],
  ["OOS / OOT", "Out of Specification / Out of Trend"],
  ["PM", "Preventive Maintenance"],
  ["PRQ", "Periodic Re-Qualification"],
  ["QMS", "Quality Management System"],
  ["SLIA", "System Level Impact Assessment"],
];

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

function seededAbbreviations(): JSONContent {
  const doc = seededTableDoc(ELR_ABBREVIATIONS_HEADERS);
  const table = doc.content?.[0];
  if (!table) return doc;
  table.content = [
    table.content?.[0] as JSONContent,
    ...ELR_STARTER_ABBREVIATIONS.map(([term, expansion]) => ({
      type: "tableRow",
      content: [textCell(term), textCell(expansion)],
    })),
  ];
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Table 1. Abbreviations" }],
      },
      table,
    ],
  };
}

function seededSystemTrends(): JSONContent {
  const doc = seededTableDoc(ELR_SYSTEM_TRENDS_HEADERS);
  const table = doc.content?.[0];
  if (!table) return doc;
  table.content = [
    table.content?.[0] as JSONContent,
    ...ELR_TREND_RECAP_SOURCES.map((source, index) => ({
      type: "tableRow",
      content: [
        textCell(String(index + 1)),
        textCell(`${source.number} ${source.label}`),
        textCell(""),
        textCell(""),
        textCell(""),
        textCell(""),
      ],
    })),
  ];
  return { type: "doc", content: [table] };
}

export const EMPTY_ELR_CONTENT: ElrSectionMap = {
  elr_objective: { narrative: emptyDoc() },
  elr_scope: { narrative: emptyDoc() },
  elr_responsibilities: {
    narrative: emptyDoc(),
    table: seededTableDoc(ELR_RESPONSIBILITIES_HEADERS),
  },
  elr_abbreviations: { table: seededAbbreviations() },
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
    narrative: emptyDoc(),
    table: seededTableDoc(ELR_ACCESS_CONTROL_HEADERS),
  },
  elr_audit_trail: {
    narrative: emptyDoc(),
    table: seededTableDoc(ELR_AUDIT_TRAIL_HEADERS),
  },
  elr_csv_status: {
    narrative: emptyDoc(),
    table: seededTableDoc(ELR_CSV_STATUS_HEADERS),
  },
  elr_discrepancies: { narrative: emptyDoc() },
  elr_system_trends: {
    narrative: emptyDoc(),
    table: seededSystemTrends(),
  },
  elr_risk_actions: {
    narrative: emptyDoc(),
    table: seededTableDoc(ELR_RISK_ACTION_HEADERS),
    overallGrade: "",
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
  equipmentMake: string;
  equipmentModel: string;
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
  equipmentMake: "",
  equipmentModel: "",
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
