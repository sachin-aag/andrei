import type { MatrixColumnSchema } from "@/lib/document-types/design-verification/matrix-columns";

/**
 * Column schemas for the SOP/QA/017-F01 R01 tables. Labels must stay identical
 * to the headers in `templates/mj-failure-investigation-report-template.docx` —
 * a colocated test asserts parity in both directions.
 */

export type FirTeamColumnId = "name" | "departmentRole";

export const FIR_TEAM_COLUMN_SCHEMA: readonly MatrixColumnSchema<FirTeamColumnId>[] =
  [
    { id: "name", label: "Name", aliases: ["name", "member", "person"] },
    {
      id: "departmentRole",
      label: "Department (Role/Responsibility)",
      aliases: [
        "department role responsibility",
        "department roleresponsibility",
        "department",
        "role responsibility",
        "role",
        "responsibility",
      ],
    },
  ];

export type FirChronologyColumnId = "activity" | "observation";

export const FIR_CHRONOLOGY_COLUMN_SCHEMA: readonly MatrixColumnSchema<FirChronologyColumnId>[] =
  [
    {
      id: "activity",
      label: "Activity / Step",
      aliases: ["activity step", "activity", "step", "event"],
    },
    {
      id: "observation",
      label: "Observation / Details",
      aliases: ["observation details", "observation", "details", "remarks"],
    },
  ];

export type FirHistoricColumnId =
  | "srNo"
  | "date"
  | "eventNo"
  | "batchNo"
  | "eventDetails"
  | "rootCause"
  | "capa";

export const FIR_HISTORIC_COLUMN_SCHEMA: readonly MatrixColumnSchema<FirHistoricColumnId>[] =
  [
    {
      id: "srNo",
      label: "Sr. No.",
      aliases: ["sr no", "sr. no.", "s no", "sl no"],
      inferFromContent: "idLike",
    },
    { id: "date", label: "Date", aliases: ["date", "event date"] },
    {
      id: "eventNo",
      label: "Event No.",
      aliases: ["event no", "event number", "erf no", "reference no", "event"],
    },
    {
      id: "batchNo",
      label: "Batch No.",
      aliases: ["batch no", "batch number", "batch", "lot no"],
    },
    {
      id: "eventDetails",
      label: "Event Details",
      aliases: ["event details", "event description", "description", "details"],
    },
    {
      id: "rootCause",
      label: "Root Cause",
      aliases: ["root cause", "cause", "probable cause"],
    },
    {
      id: "capa",
      label: "CAPA",
      aliases: [
        "capa",
        "corrective action",
        "preventive action",
        "corrective and preventive action",
        "action taken",
      ],
    },
  ];

export type FirHumanErrorColumnId =
  | "srNo"
  | "employeeId"
  | "error"
  | "category";

export const FIR_HUMAN_ERROR_COLUMN_SCHEMA: readonly MatrixColumnSchema<FirHumanErrorColumnId>[] =
  [
    {
      id: "srNo",
      label: "Sr. No.",
      aliases: ["sr no", "sr. no.", "s no", "sl no"],
      inferFromContent: "idLike",
    },
    {
      id: "employeeId",
      label: "Employee ID",
      aliases: ["employee id", "emp id", "employee code", "personnel id"],
    },
    { id: "error", label: "Error", aliases: ["error", "error description"] },
    {
      id: "category",
      label: "Category",
      aliases: ["category", "error category", "classification"],
    },
  ];

export type FirActionColumnId =
  | "srNo"
  | "actionPlan"
  | "responsibility"
  | "targetDate"
  | "reference";

export const FIR_ACTION_COLUMN_SCHEMA: readonly MatrixColumnSchema<FirActionColumnId>[] =
  [
    {
      id: "srNo",
      label: "Sr. No.",
      aliases: ["sr no", "sr. no.", "s no", "sl no"],
      inferFromContent: "idLike",
    },
    {
      id: "actionPlan",
      label: "Action Plan",
      aliases: ["action plan", "action", "plan", "description"],
    },
    {
      id: "responsibility",
      label: "Responsibility",
      aliases: ["responsibility", "owner", "responsible", "department"],
    },
    {
      id: "targetDate",
      label: "Target Completion Date",
      aliases: [
        "target completion date",
        "target date",
        "tcd",
        "due date",
        "completion date",
      ],
    },
    {
      id: "reference",
      label: "Reference / Change Control No.",
      aliases: [
        "reference change control no",
        "reference",
        "change control no",
        "change control",
        "cc no",
      ],
    },
  ];

export type FirEffectivenessColumnId =
  | "srNo"
  | "activity"
  | "criteria"
  | "duration"
  | "responsibility"
  | "remarks";

export const FIR_EFFECTIVENESS_COLUMN_SCHEMA: readonly MatrixColumnSchema<FirEffectivenessColumnId>[] =
  [
    {
      id: "srNo",
      label: "Sr. No.",
      aliases: ["sr no", "sr. no.", "s no", "sl no"],
      inferFromContent: "idLike",
    },
    {
      id: "activity",
      label: "Activity",
      aliases: ["activity", "check", "verification activity"],
    },
    {
      id: "criteria",
      label: "Acceptance Criteria",
      aliases: [
        "acceptance criteria",
        "criteria",
        "details criteria",
        "acceptance",
      ],
    },
    {
      id: "duration",
      label: "Duration",
      aliases: ["duration", "period", "review period", "timeframe"],
    },
    {
      id: "responsibility",
      label: "Responsibility",
      aliases: ["responsibility", "owner", "responsible"],
    },
    { id: "remarks", label: "Remarks", aliases: ["remarks", "comments", "note"] },
  ];

export type FirAttachmentColumnId =
  | "attachmentNo"
  | "description"
  | "documentRef"
  | "pages";

export const FIR_ATTACHMENT_COLUMN_SCHEMA: readonly MatrixColumnSchema<FirAttachmentColumnId>[] =
  [
    {
      id: "attachmentNo",
      label: "Attachment No.",
      aliases: ["attachment no", "attachment number", "sr no", "attachment"],
      inferFromContent: "idLike",
    },
    {
      id: "description",
      label: "Description",
      aliases: ["description", "title", "attachment description"],
    },
    {
      id: "documentRef",
      label: "Document Reference No.",
      aliases: [
        "document reference no",
        "document ref",
        "reference no",
        "doc no",
      ],
    },
    {
      id: "pages",
      label: "No. of Pages",
      aliases: ["no of pages", "pages", "page count"],
    },
  ];
