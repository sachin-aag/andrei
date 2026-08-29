import type { JSONContent } from "@tiptap/core";
import { emptyDoc } from "@/lib/tiptap/rich-text";
import { seededTableDoc } from "@/lib/document-types/design-verification/sections";
import type { AssessmentMode } from "./scoring";

/**
 * Prefix every key with `qra_`. SUGGEST_TARGET_FIELD_PATTERNS is a flat map
 * shared across types; unprefixed keys (scope, conclusion, revision_history)
 * already belong to other types.
 */
export const QRA_SECTION_KEYS = [
  "qra_approach",
  "qra_objective",
  "qra_scope",
  "qra_overview",
  "qra_procedure",
  "qra_team",
  "qra_risk_identification",
  "qra_fmea",
  "qra_communication",
  "qra_pre_conclusion",
  "qra_mitigation",
  "qra_residual_risk",
  "qra_periodic_review",
  "qra_post_conclusion",
  "qra_revision_history",
] as const;

export type QraSectionKey = (typeof QRA_SECTION_KEYS)[number];

export const QRA_TEAM_HEADERS = [
  "Sr. No.",
  "Name",
  "Department",
  "Designation",
] as const;

export const QRA_RISK_IDENTIFICATION_HEADERS = [
  "S. No.",
  "Process / activity",
  "Identify Failure",
] as const;

/** F02 p. 37 — initial scores, mitigation, and revised scores in one grid. */
export const QRA_FMEA_HEADERS = [
  "Sr. No.",
  "Process / activity",
  "Potential Failure",
  "Probable cause of failure",
  "Potential Effect(s) of Failure",
  "Severity (S)",
  "Control Measures",
  "Probability (P)",
  "Detection Measures",
  "Detectability (D)",
  "RPN / RPR",
  "Risk Acceptable (Yes/No)",
  "Mitigation Plan",
  "Responsibility and TCD",
  "Revised S",
  "Revised P",
  "Revised D",
  "Final RPN / RPR",
  "Final Risk Acceptable (Yes/No)",
] as const;

export const QRA_COMMUNICATION_HEADERS = [
  "Sr. No.",
  "Document No.",
  "Applicable",
  "Mitigation Proposal",
  "Responsibility",
  "TCD",
] as const;

export const QRA_MITIGATION_HEADERS = [
  "Sr. No.",
  "Mitigation Plan",
  "Reference",
  "Proposed change",
  "Actual change",
  "Completion Date",
  "Closure Date",
  "Sign/Date",
] as const;

export const QRA_RESIDUAL_RISK_HEADERS = QRA_FMEA_HEADERS;

export const QRA_REVISION_HISTORY_HEADERS = [
  "Revision No.",
  "Change",
  "Change History No.",
] as const;

export type QraNarrativeSection = { narrative: JSONContent };
export type QraTableSection = { table: JSONContent };
export type QraNarrativeTableSection = {
  narrative: JSONContent;
  table: JSONContent;
};

export type QraYesNo = "yes" | "no" | "";

export type QraApproachSection = {
  impactKnown: QraYesNo;
  scopeDefined: QraYesNo;
  scopeNarrow: QraYesNo;
  assessmentMode: AssessmentMode | "";
  narrative: JSONContent;
};

export type QraPeriodicReviewSection = {
  applicable: QraYesNo;
  narrative: JSONContent;
};

export type QraSectionMap = {
  qra_approach: QraApproachSection;
  qra_objective: QraNarrativeSection;
  qra_scope: QraNarrativeSection;
  qra_overview: QraNarrativeSection;
  qra_procedure: QraNarrativeSection;
  qra_team: QraTableSection;
  qra_risk_identification: QraTableSection;
  qra_fmea: QraNarrativeTableSection;
  qra_communication: QraNarrativeTableSection;
  qra_pre_conclusion: QraNarrativeSection;
  qra_mitigation: QraNarrativeTableSection;
  qra_residual_risk: QraNarrativeTableSection;
  qra_periodic_review: QraPeriodicReviewSection;
  qra_post_conclusion: QraNarrativeSection;
  qra_revision_history: QraTableSection;
};

export const QRA_SECTION_LABELS: Record<QraSectionKey, string> = {
  qra_approach: "Risk Assessment Approach",
  qra_objective: "Objective",
  qra_scope: "Scope",
  qra_overview: "System / Equipment Overview",
  qra_procedure: "Procedure",
  qra_team: "Risk Assessment Team",
  qra_risk_identification: "Risk Identification",
  qra_fmea: "Risk Identification and Evaluation",
  qra_communication: "Risk Communication",
  qra_pre_conclusion: "Summary and Conclusion (Before Implementation)",
  qra_mitigation: "Mitigation Plan and Closure",
  qra_residual_risk: "New / Residual Risk",
  qra_periodic_review: "Periodic Review",
  qra_post_conclusion: "Summary and Conclusion (After Implementation)",
  qra_revision_history: "Revision History",
};

function seededFmea(): JSONContent {
  const doc = seededTableDoc(QRA_FMEA_HEADERS);
  const table = doc.content?.[0];
  const firstData = table?.content?.[1];
  const firstCell = firstData?.content?.[0];
  if (firstCell) {
    firstCell.content = [
      {
        type: "paragraph",
        content: [{ type: "text", text: "R01" }],
      },
    ];
  }
  return doc;
}

export const EMPTY_QRA_CONTENT: QraSectionMap = {
  qra_approach: {
    impactKnown: "",
    scopeDefined: "",
    scopeNarrow: "",
    assessmentMode: "",
    narrative: emptyDoc(),
  },
  qra_objective: { narrative: emptyDoc() },
  qra_scope: { narrative: emptyDoc() },
  qra_overview: { narrative: emptyDoc() },
  qra_procedure: { narrative: emptyDoc() },
  qra_team: { table: seededTableDoc(QRA_TEAM_HEADERS) },
  qra_risk_identification: {
    table: seededTableDoc(QRA_RISK_IDENTIFICATION_HEADERS),
  },
  qra_fmea: { narrative: emptyDoc(), table: seededFmea() },
  qra_communication: {
    narrative: emptyDoc(),
    table: seededTableDoc(QRA_COMMUNICATION_HEADERS),
  },
  qra_pre_conclusion: { narrative: emptyDoc() },
  qra_mitigation: {
    narrative: emptyDoc(),
    table: seededTableDoc(QRA_MITIGATION_HEADERS),
  },
  qra_residual_risk: { narrative: emptyDoc(), table: seededFmea() },
  qra_periodic_review: { applicable: "", narrative: emptyDoc() },
  qra_post_conclusion: { narrative: emptyDoc() },
  qra_revision_history: {
    table: seededTableDoc(QRA_REVISION_HISTORY_HEADERS),
  },
};

export type QraMetadata = {
  revision: string;
  department: string;
  title: string;
  productName: string;
  sourceDocumentName: string;
  sourceDocumentNo: string;
  idNo: string;
  preApproval: string;
  postApproval: string;
};

export const QRA_DEFAULT_METADATA: QraMetadata = {
  revision: "R00",
  department: "",
  title: "",
  productName: "",
  sourceDocumentName: "",
  sourceDocumentNo: "",
  idNo: "",
  preApproval: "",
  postApproval: "",
};
