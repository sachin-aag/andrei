import type { MatrixColumnSchema } from "@/lib/document-types/design-verification/matrix-columns";

/**
 * Column schemas for the ELR evidence tables. Resolution is by header meaning
 * first (aliases), so a table the assistant reformatted still evaluates.
 */

const SERIAL: MatrixColumnSchema<"serial"> = {
  id: "serial",
  label: "Sr. No.",
  aliases: ["sr no", "s no", "sl no", "serial"],
};

function serialFor<Id extends string>(): MatrixColumnSchema<Id> {
  return SERIAL as unknown as MatrixColumnSchema<Id>;
}

export type QualificationColumnId =
  | "serial"
  | "stage"
  | "documentNo"
  | "formatApplicability"
  | "dateCompleted"
  | "outcome"
  | "discrepancyRef"
  | "nextDueDate"
  | "remarks";

export const QUALIFICATION_COLUMN_SCHEMA: readonly MatrixColumnSchema<QualificationColumnId>[] =
  [
    serialFor<QualificationColumnId>(),
    {
      id: "stage",
      label: "Qualification Stage",
      aliases: ["qualification stage", "stage", "activity"],
    },
    {
      id: "documentNo",
      label: "Protocol / Report No.",
      aliases: [
        "protocol report no",
        "protocol no",
        "report no",
        "document no",
        "document reference no",
      ],
      inferFromContent: "idLike",
    },
    {
      id: "formatApplicability",
      label: "Format Applicability",
      aliases: ["format applicability", "format", "applicability"],
    },
    {
      id: "dateCompleted",
      label: "Date Completed",
      aliases: ["date completed", "completion date", "date"],
    },
    {
      id: "outcome",
      label: "Outcome",
      aliases: ["outcome", "result", "status"],
      inferFromContent: "passFail",
    },
    {
      id: "discrepancyRef",
      label: "Discrepancy / QDF Ref.",
      aliases: ["discrepancy qdf ref", "discrepancy", "qdf", "qdf ref"],
    },
    {
      id: "nextDueDate",
      label: "Next Due Date",
      aliases: ["next due date", "next due", "due date"],
    },
    { id: "remarks", label: "Remarks", aliases: ["remarks", "remark", "notes"] },
  ];

export type MediaFillColumnId =
  | "serial"
  | "mediaFillNo"
  | "configuration"
  | "date"
  | "lineShift"
  | "unitsFilled"
  | "contaminatedUnits"
  | "result"
  | "deviationRef";

export const MEDIA_FILL_COLUMN_SCHEMA: readonly MatrixColumnSchema<MediaFillColumnId>[] =
  [
    serialFor<MediaFillColumnId>(),
    {
      id: "mediaFillNo",
      label: "Media Fill No.",
      aliases: ["media fill no", "media fill", "aps no", "mf no"],
      inferFromContent: "idLike",
    },
    {
      id: "configuration",
      label: "Format / Configuration",
      aliases: ["format configuration", "configuration", "format"],
    },
    { id: "date", label: "Date", aliases: ["date"] },
    {
      id: "lineShift",
      label: "Line / Shift",
      aliases: ["line shift", "line", "shift"],
    },
    {
      id: "unitsFilled",
      label: "Units Filled",
      aliases: ["units filled", "no of units filled", "units"],
    },
    {
      id: "contaminatedUnits",
      label: "Contaminated Units",
      aliases: [
        "contaminated units",
        "no of contaminated units",
        "contaminated",
        "positives",
      ],
    },
    {
      id: "result",
      label: "Result",
      aliases: ["result", "outcome"],
      inferFromContent: "passFail",
    },
    {
      id: "deviationRef",
      label: "Linked Deviation Ref.",
      aliases: ["linked deviation ref", "deviation ref", "deviation"],
    },
  ];

export type MonitoringColumnId =
  | "serial"
  | "parameter"
  | "period"
  | "documentRef"
  | "resultSummary"
  | "excursion"
  | "deviationRef";

export const MONITORING_COLUMN_SCHEMA: readonly MatrixColumnSchema<MonitoringColumnId>[] =
  [
    serialFor<MonitoringColumnId>(),
    {
      id: "parameter",
      label: "Monitoring Parameter",
      aliases: ["monitoring parameter", "parameter"],
    },
    {
      id: "period",
      label: "Period Covered",
      aliases: ["period covered", "period"],
    },
    {
      id: "documentRef",
      label: "Document Reference No.",
      aliases: ["document reference no", "document reference", "document no"],
    },
    {
      id: "resultSummary",
      label: "Result Summary",
      aliases: ["result summary", "result", "summary"],
    },
    {
      id: "excursion",
      label: "Excursion (Y/N)",
      aliases: ["excursion y n", "excursion", "excursions"],
    },
    {
      id: "deviationRef",
      label: "Linked Deviation Ref.",
      aliases: ["linked deviation ref", "deviation ref", "deviation"],
    },
  ];

export type CalibrationColumnId =
  | "serial"
  | "instrumentId"
  | "description"
  | "dueDate"
  | "doneDate"
  | "certificateRef"
  | "result"
  | "deviationRef";

export const CALIBRATION_COLUMN_SCHEMA: readonly MatrixColumnSchema<CalibrationColumnId>[] =
  [
    serialFor<CalibrationColumnId>(),
    {
      id: "instrumentId",
      label: "Instrument ID / Tag",
      aliases: ["instrument id tag", "instrument id", "instrument tag", "tag"],
      inferFromContent: "idLike",
    },
    {
      id: "description",
      label: "Instrument Description",
      aliases: ["instrument description", "description", "instrument"],
    },
    {
      id: "dueDate",
      label: "Cal. Due Date",
      aliases: ["cal due date", "calibration due date", "due date"],
    },
    {
      id: "doneDate",
      label: "Cal. Done Date",
      aliases: ["cal done date", "calibration done date", "done date"],
    },
    {
      id: "certificateRef",
      label: "Certificate / Doc. Ref.",
      aliases: ["certificate doc ref", "certificate", "certificate ref"],
    },
    {
      id: "result",
      label: "Result (Pass / OOT)",
      aliases: ["result pass oot", "result", "pass oot"],
      inferFromContent: "passFail",
    },
    {
      id: "deviationRef",
      label: "Linked Deviation / CAPA Ref.",
      aliases: ["linked deviation capa ref", "deviation capa ref", "capa ref"],
    },
  ];

export type PreventiveMaintenanceColumnId =
  | "serial"
  | "checklistNo"
  | "frequency"
  | "dueDate"
  | "completedDate"
  | "workOrderRef"
  | "status"
  | "remarks";

export const PREVENTIVE_MAINTENANCE_COLUMN_SCHEMA: readonly MatrixColumnSchema<PreventiveMaintenanceColumnId>[] =
  [
    serialFor<PreventiveMaintenanceColumnId>(),
    {
      id: "checklistNo",
      label: "PM Checklist No.",
      aliases: ["pm checklist no", "checklist no", "pmc no", "pmc"],
      inferFromContent: "idLike",
    },
    {
      id: "frequency",
      label: "PM Frequency",
      aliases: ["pm frequency", "frequency"],
    },
    { id: "dueDate", label: "PM Due Date", aliases: ["pm due date", "due date"] },
    {
      id: "completedDate",
      label: "PM Completed Date",
      aliases: ["pm completed date", "completed date", "completion date"],
    },
    {
      id: "workOrderRef",
      label: "Work Order / Doc. Ref.",
      aliases: ["work order doc ref", "work order", "document ref"],
    },
    {
      id: "status",
      label: "Status (On-time / Delayed)",
      aliases: ["status on time delayed", "status"],
    },
    { id: "remarks", label: "Remarks", aliases: ["remarks", "remark", "notes"] },
  ];

export type BreakdownColumnId =
  | "serial"
  | "date"
  | "documentRef"
  | "failureDescription"
  | "downtime"
  | "correctiveAction"
  | "formatImpact"
  | "repeat"
  | "capaRef";

export const BREAKDOWN_COLUMN_SCHEMA: readonly MatrixColumnSchema<BreakdownColumnId>[] =
  [
    serialFor<BreakdownColumnId>(),
    {
      id: "date",
      label: "Date of Breakdown",
      aliases: ["date of breakdown", "breakdown date", "date"],
    },
    {
      id: "documentRef",
      label: "Document Reference",
      aliases: ["document reference", "document ref", "document no"],
    },
    {
      id: "failureDescription",
      label: "Component / Failure Description",
      aliases: [
        "component failure description",
        "failure description",
        "description",
        "failure",
      ],
    },
    {
      id: "downtime",
      label: "Downtime (Hrs)",
      aliases: ["downtime hrs", "downtime", "hours"],
    },
    {
      id: "correctiveAction",
      label: "Corrective Action Taken",
      aliases: ["corrective action taken", "corrective action", "action taken"],
    },
    {
      id: "formatImpact",
      label: "Format Impact",
      aliases: ["format impact", "format", "applicability"],
    },
    {
      id: "repeat",
      label: "Repeat (Y/N)",
      aliases: ["repeat y n", "repeat", "repeat occurrence"],
    },
    {
      id: "capaRef",
      label: "Linked CAPA Ref.",
      aliases: ["linked capa ref", "capa ref", "capa"],
    },
  ];

export type QmsColumnId =
  | "serial"
  | "type"
  | "documentRef"
  | "dateInitiated"
  | "title"
  | "formatApplicability"
  | "status"
  | "dateClosed"
  | "qualificationImpact"
  | "remarks";

export const QMS_COLUMN_SCHEMA: readonly MatrixColumnSchema<QmsColumnId>[] = [
  serialFor<QmsColumnId>(),
  {
    id: "type",
    label: "Type (CC / Dev / CAPA / OOS / OOT)",
    aliases: ["type cc dev capa oos oot", "type", "record type"],
  },
  {
    id: "documentRef",
    label: "Document Reference No.",
    aliases: ["document reference no", "document reference", "document no"],
    inferFromContent: "idLike",
  },
  {
    id: "dateInitiated",
    label: "Date Initiated",
    aliases: ["date initiated", "initiated", "opened"],
  },
  {
    id: "title",
    label: "Title / Description",
    aliases: ["title description", "title", "description"],
  },
  {
    id: "formatApplicability",
    label: "Format Applicability",
    aliases: ["format applicability", "format", "applicability"],
  },
  { id: "status", label: "Status", aliases: ["status", "open closed"] },
  {
    id: "dateClosed",
    label: "Date Closed",
    aliases: ["date closed", "closed", "closure date"],
  },
  {
    id: "qualificationImpact",
    label: "Qualification Impact (Y/N)",
    aliases: [
      "qualification impact y n",
      "qualification impact",
      "qual impact",
      "impact",
    ],
  },
  { id: "remarks", label: "Remarks", aliases: ["remarks", "remark", "notes"] },
];

export type AlarmColumnId =
  | "serial"
  | "code"
  | "description"
  | "criticality"
  | "repetitions"
  | "trendReportRef"
  | "remediation"
  | "deviationRef";

export const ALARM_COLUMN_SCHEMA: readonly MatrixColumnSchema<AlarmColumnId>[] =
  [
    serialFor<AlarmColumnId>(),
    {
      id: "code",
      label: "Alarm Code",
      aliases: ["alarm code", "code", "alarm no"],
    },
    {
      id: "description",
      label: "Alarm Description",
      aliases: ["alarm description", "description", "alarm"],
    },
    {
      id: "criticality",
      label: "Criticality (DI / II)",
      aliases: ["criticality di ii", "criticality", "impact", "category"],
    },
    {
      id: "repetitions",
      label: "No. of Repetitions",
      aliases: ["no of repetitions", "repetitions", "occurrences", "count"],
    },
    {
      id: "trendReportRef",
      label: "Trend Report Ref.",
      aliases: ["trend report ref", "trend report", "document reference"],
    },
    {
      id: "remediation",
      label: "Remediation / Action Plan Ref.",
      aliases: [
        "remediation action plan ref",
        "remediation",
        "action plan",
        "aap",
      ],
    },
    {
      id: "deviationRef",
      label: "Deviation / CAPA Ref.",
      aliases: ["deviation capa ref", "deviation ref", "capa ref"],
    },
  ];

export type AccessControlColumnId =
  | "serial"
  | "systemName"
  | "userName"
  | "role"
  | "action"
  | "date"
  | "documentRef";

export const ACCESS_CONTROL_COLUMN_SCHEMA: readonly MatrixColumnSchema<AccessControlColumnId>[] =
  [
    serialFor<AccessControlColumnId>(),
    {
      id: "systemName",
      label: "System Name / ID",
      aliases: ["system name id", "system name", "system"],
    },
    {
      id: "userName",
      label: "User Name / ID",
      aliases: ["user name id", "user name", "user", "user id"],
    },
    {
      id: "role",
      label: "Role / Privilege Level",
      aliases: ["role privilege level", "role", "privilege", "access level"],
    },
    {
      id: "action",
      label: "Action (Granted / Modified / Revoked)",
      aliases: ["action granted modified revoked", "action"],
    },
    { id: "date", label: "Date", aliases: ["date"] },
    {
      id: "documentRef",
      label: "Document Reference",
      aliases: ["document reference", "document ref", "document no"],
    },
  ];

export type AuditTrailColumnId =
  | "serial"
  | "systemName"
  | "reviewPeriod"
  | "documentRef"
  | "reviewedBy"
  | "anomalyFound"
  | "remarks";

export const AUDIT_TRAIL_COLUMN_SCHEMA: readonly MatrixColumnSchema<AuditTrailColumnId>[] =
  [
    serialFor<AuditTrailColumnId>(),
    {
      id: "systemName",
      label: "System Name / ID",
      aliases: ["system name id", "system name", "system"],
    },
    {
      id: "reviewPeriod",
      label: "Review Period",
      aliases: ["review period", "period"],
    },
    {
      id: "documentRef",
      label: "Document Reference",
      aliases: ["document reference", "document ref", "document no"],
    },
    {
      id: "reviewedBy",
      label: "Reviewed By",
      aliases: ["reviewed by", "reviewer"],
    },
    {
      id: "anomalyFound",
      label: "Anomaly Found (Y/N)",
      aliases: ["anomaly found y n", "anomaly found", "anomaly"],
    },
    {
      id: "remarks",
      label: "Remarks / Linked Deviation Ref.",
      aliases: ["remarks linked deviation ref", "remarks", "deviation ref"],
    },
  ];

export type CsvStatusColumnId =
  | "serial"
  | "systemName"
  | "validationStatus"
  | "lastValidationDate"
  | "documentRef"
  | "changeSinceLastPrq"
  | "changeControlRef"
  | "remarks";

export const CSV_STATUS_COLUMN_SCHEMA: readonly MatrixColumnSchema<CsvStatusColumnId>[] =
  [
    serialFor<CsvStatusColumnId>(),
    {
      id: "systemName",
      label: "System Name / ID",
      aliases: ["system name id", "system name", "system"],
    },
    {
      id: "validationStatus",
      label: "Validation Status",
      aliases: ["validation status", "status"],
    },
    {
      id: "lastValidationDate",
      label: "Last Validation / Revalidation Date",
      aliases: [
        "last validation revalidation date",
        "last validation date",
        "validation date",
      ],
    },
    {
      id: "documentRef",
      label: "Document Reference",
      aliases: ["document reference", "document ref", "document no"],
    },
    {
      id: "changeSinceLastPrq",
      label: "Change Since Last PRQ (Y/N)",
      aliases: [
        "change since last prq y n",
        "change since last prq",
        "change since last rq",
        "change",
      ],
    },
    {
      id: "changeControlRef",
      label: "Change Control Ref.",
      aliases: ["change control ref", "change control", "ccf"],
    },
    { id: "remarks", label: "Remarks", aliases: ["remarks", "remark", "notes"] },
  ];

export type ResponsibilitiesColumnId = "serial" | "department" | "responsibility";

export const RESPONSIBILITIES_COLUMN_SCHEMA: readonly MatrixColumnSchema<ResponsibilitiesColumnId>[] =
  [
    serialFor<ResponsibilitiesColumnId>(),
    {
      id: "department",
      label: "Department",
      aliases: ["department", "dept", "role"],
    },
    {
      id: "responsibility",
      label: "Responsibilities",
      aliases: ["responsibilities", "responsibility"],
    },
  ];

export type ElrRevisionHistoryColumnId =
  | "revision"
  | "effectiveDate"
  | "change"
  | "changeControlNo";

export const ELR_REVISION_HISTORY_COLUMN_SCHEMA: readonly MatrixColumnSchema<ElrRevisionHistoryColumnId>[] =
  [
    {
      id: "revision",
      label: "Revision No.",
      aliases: ["revision no", "revision", "rev"],
    },
    {
      id: "effectiveDate",
      label: "Effective Date",
      aliases: ["effective date", "date"],
    },
    {
      id: "change",
      label: "Change History",
      aliases: ["change history", "change", "description"],
    },
    {
      id: "changeControlNo",
      label: "Change Control No.",
      aliases: ["change control no", "change control", "ccf"],
    },
  ];
