import type { MatrixColumnSchema } from "@/lib/document-types/design-verification/matrix-columns";

export type FmeaColumnId =
  | "riskId"
  | "process"
  | "failure"
  | "cause"
  | "effect"
  | "severity"
  | "controls"
  | "probability"
  | "detectionMeasures"
  | "detectability"
  | "rpn"
  | "acceptable"
  | "mitigation"
  | "responsibility"
  | "revisedSeverity"
  | "revisedProbability"
  | "revisedDetectability"
  | "finalRpn"
  | "finalAcceptable";

export const FMEA_COLUMN_SCHEMA: readonly MatrixColumnSchema<FmeaColumnId>[] = [
  {
    id: "riskId",
    label: "Sr. No.",
    aliases: ["sr no", "sr. no.", "s no", "risk id", "id"],
    inferFromContent: "idLike",
  },
  {
    id: "process",
    label: "Process / activity",
    aliases: ["process activity", "process", "activity"],
  },
  {
    id: "failure",
    label: "Potential Failure",
    aliases: ["potential failure", "failure", "identify failure", "failure mode"],
  },
  {
    id: "cause",
    label: "Probable cause of failure",
    aliases: ["probable cause of failure", "cause", "probable cause"],
  },
  {
    id: "effect",
    label: "Potential Effect(s) of Failure",
    aliases: ["potential effect", "potential effects of failure", "effect", "effects"],
  },
  {
    id: "severity",
    label: "Severity (S)",
    aliases: ["severity s", "severity", "s"],
  },
  {
    id: "controls",
    label: "Control Measures",
    aliases: ["control measures", "controls", "current control"],
  },
  {
    id: "probability",
    label: "Probability (P)",
    aliases: ["probability p", "probability", "occurrence", "p"],
  },
  {
    id: "detectionMeasures",
    label: "Detection Measures",
    aliases: ["detection measures", "detection"],
  },
  {
    id: "detectability",
    label: "Detectability (D)",
    aliases: ["detectability d", "detectability", "d"],
  },
  {
    id: "rpn",
    label: "RPN / RPR",
    aliases: ["rpn rpr", "rpn", "rpr", "sxp xd", "s x p x d"],
  },
  {
    id: "acceptable",
    label: "Risk Acceptable (Yes/No)",
    aliases: ["risk acceptable yes no", "risk acceptable", "acceptable"],
  },
  {
    id: "mitigation",
    label: "Mitigation Plan",
    aliases: ["mitigation plan", "mitigation"],
  },
  {
    id: "responsibility",
    label: "Responsibility and TCD",
    aliases: ["responsibility and tcd", "responsibility", "tcd"],
  },
  {
    id: "revisedSeverity",
    label: "Revised S",
    aliases: ["revised s", "revised severity"],
  },
  {
    id: "revisedProbability",
    label: "Revised P",
    aliases: ["revised p", "revised probability"],
  },
  {
    id: "revisedDetectability",
    label: "Revised D",
    aliases: ["revised d", "revised detectability"],
  },
  {
    id: "finalRpn",
    label: "Final RPN / RPR",
    aliases: ["final rpn rpr", "final rpn", "final rpr", "final sxp xd"],
  },
  {
    id: "finalAcceptable",
    label: "Final Risk Acceptable (Yes/No)",
    aliases: [
      "final risk acceptable yes no",
      "final risk acceptable",
      "final acceptable",
    ],
  },
];

export type TeamColumnId = "serial" | "name" | "department" | "designation";

export const TEAM_COLUMN_SCHEMA: readonly MatrixColumnSchema<TeamColumnId>[] = [
  { id: "serial", label: "Sr. No.", aliases: ["sr no", "s no"] },
  { id: "name", label: "Name", aliases: ["name"] },
  { id: "department", label: "Department", aliases: ["department", "dept"] },
  { id: "designation", label: "Designation", aliases: ["designation", "title"] },
];

export type RiskIdColumnId = "serial" | "process" | "failure";

export const RISK_IDENTIFICATION_COLUMN_SCHEMA: readonly MatrixColumnSchema<RiskIdColumnId>[] =
  [
    { id: "serial", label: "S. No.", aliases: ["s no", "sr no"] },
    {
      id: "process",
      label: "Process / activity",
      aliases: ["process activity", "process", "activity"],
    },
    {
      id: "failure",
      label: "Identify Failure",
      aliases: ["identify failure", "failure", "potential failure"],
    },
  ];

export type MitigationColumnId =
  | "serial"
  | "plan"
  | "reference"
  | "proposed"
  | "actual"
  | "completionDate"
  | "closureDate"
  | "signDate";

export const MITIGATION_COLUMN_SCHEMA: readonly MatrixColumnSchema<MitigationColumnId>[] =
  [
    { id: "serial", label: "Sr. No.", aliases: ["sr no", "s no"] },
    { id: "plan", label: "Mitigation Plan", aliases: ["mitigation plan", "plan"] },
    { id: "reference", label: "Reference", aliases: ["reference"] },
    {
      id: "proposed",
      label: "Proposed change",
      aliases: ["proposed change", "proposed"],
    },
    { id: "actual", label: "Actual change", aliases: ["actual change", "actual"] },
    {
      id: "completionDate",
      label: "Completion Date",
      aliases: ["completion date"],
    },
    { id: "closureDate", label: "Closure Date", aliases: ["closure date"] },
    { id: "signDate", label: "Sign/Date", aliases: ["sign date", "sign"] },
  ];

export type RevisionHistoryColumnId = "revision" | "change" | "changeHistoryNo";

export const QRA_REVISION_HISTORY_COLUMN_SCHEMA: readonly MatrixColumnSchema<RevisionHistoryColumnId>[] =
  [
    {
      id: "revision",
      label: "Revision No.",
      aliases: ["revision no", "revision", "rev"],
    },
    { id: "change", label: "Change", aliases: ["change", "description"] },
    {
      id: "changeHistoryNo",
      label: "Change History No.",
      aliases: ["change history no", "change history", "ccf"],
    },
  ];
