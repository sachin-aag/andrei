import type { SectionType } from "@/db/schema";

export type CriterionDefinition = {
  key: string;
  label: string;
  description: string;
};

export const DEFINE_CRITERIA: CriterionDefinition[] = [
  {
    key: "define.what_happened",
    label: "Clearly define what happened actually",
    description:
      "Does the narrative clearly describe the actual event in concrete, factual terms?",
  },
  {
    key: "define.what_is_different",
    label: "Explain what is different than expected",
    description:
      "Does the narrative explain the expected behavior and the observed deviation from it?",
  },
  {
    key: "define.location",
    label: "Mention the location where the deviation occurred",
    description: "Is a specific physical location (area, room, equipment ID) identified?",
  },
  {
    key: "define.datetime",
    label: "Date/time of occurrence and date/time of detection",
    description:
      "Does the narrative specify both when the deviation occurred and when it was detected?",
  },
  {
    key: "define.personnel",
    label: "Personnel involved in the deviation",
    description:
      "Are the personnel (by employee ID or role) who were involved identified?",
  },
  {
    key: "define.initial_scope",
    label: "Initial scope (impacted product/material/equipment/system/batches)",
    description: "Is the initial scope of impact explicitly stated?",
  },
];

export const MEASURE_CRITERIA: CriterionDefinition[] = [
  {
    key: "measure.facts_data",
    label:
      "Relevant facts and data reviewed (environment, process/product history, personnel info, control limits)",
    description:
      "Does the summary provide relevant facts and data reviewed including environment, process/product history, personnel info (title and job title), controls limits, etc?",
  },
  {
    key: "measure.analysis_summary",
    label: "Summary of analysis of factors and data provided",
    description: "Is a summary of the analysis of the factors and data provided?",
  },
  {
    key: "measure.conclusion_statement",
    label: "Conclusion statement of the analysis and review",
    description: "Is a clear conclusion statement of the analysis and review provided?",
  },
  {
    key: "measure.regulatory_notification",
    label: "Regulatory notification details (if applicable)",
    description:
      "If there were regulatory notifications, are the details provided? If not applicable, is that explicit?",
  },
  {
    key: "measure.logical_flow",
    label: "Logical flow and readability",
    description:
      "Is the report written in a logical flow and easily understood by the reader?",
  },
];

export const ANALYZE_CRITERIA: CriterionDefinition[] = [
  {
    key: "analyze.sixm_completeness",
    label: "6M method completeness",
    description:
      "Are all 6M fields filled (Man, Machine, Measurement, Material, Method, Milieu) with an answer (even if 'Not Applicable') and a conclusion provided?",
  },
  {
    key: "analyze.fivewhy_completeness",
    label: "5-Why approach completeness",
    description:
      "Are the 5-Why questions and answers filled (with Not Applicable where appropriate) and a conclusion provided?",
  },
  {
    key: "analyze.investigation_outcome",
    label: "Investigation outcome summarized",
    description:
      "Is the investigation outcome clearly described, referencing the tools used?",
  },
  {
    key: "analyze.root_cause",
    label: "Root cause categorization (Level 1, 2, 3)",
    description:
      "Is the primary, secondary, and third level root cause identified per SOP?",
  },
  {
    key: "analyze.impact_assessment",
    label: "Impact assessment (System/Document/Product/Equipment/Patient safety)",
    description:
      "Is the impact assessment filled for all five fields with a clear statement for each?",
  },
];

export const IMPROVE_CRITERIA: CriterionDefinition[] = [
  {
    key: "improve.specific_actions",
    label:
      "Specific corrective actions identified (including applicable immediate actions)",
    description:
      "Were specific corrective actions identified to remediate the current issue such that the associated system was returned to a state of control/compliance?",
  },
  {
    key: "improve.per_root_cause",
    label: "Corrective actions for each root cause / substantiated probable root cause",
    description:
      "Were specific corrective actions identified for each root cause / substantiated probable root cause, as applicable?",
  },
  {
    key: "improve.tracking_fields",
    label: "Unique number, responsible person, and due date assigned",
    description:
      "Was the corrective action assigned a unique number, responsible person and due date so it can be tracked?",
  },
  {
    key: "improve.expected_outcome",
    label: "Expected outcome described and verifiable",
    description: "Does the action describe the expected outcome that can be verified?",
  },
  {
    key: "improve.effectiveness",
    label: "Effectiveness verification documented",
    description:
      "Was effectiveness verification required or not, and the rationale for either documented?",
  },
  {
    key: "improve.achievable",
    label: "Actions achievable",
    description:
      "Are the identified corrective actions achievable based on the information provided?",
  },
];

export const CONTROL_CRITERIA: CriterionDefinition[] = [
  {
    key: "control.preventive_per_root_cause",
    label: "Preventive actions for each root cause / substantiated probable root cause",
    description:
      "Were specific preventive actions identified for each root cause / substantiated probable root cause as applicable?",
  },
  {
    key: "control.linked_to_root_cause",
    label: "Linked to the classification of the root cause",
    description:
      "Was the preventive action linked to the classification of the root cause and explanation given for how it will prevent recurrence?",
  },
  {
    key: "control.tracking_fields",
    label: "Unique number, responsible person, due date assigned",
    description:
      "Was the preventive action assigned a unique number, responsible person and due date so it can be tracked?",
  },
  {
    key: "control.expected_outcome",
    label: "Expected outcome verifiable",
    description: "Does the action describe an expected outcome that can be verified?",
  },
  {
    key: "control.effectiveness",
    label: "Effectiveness verification documented",
    description:
      "Was effectiveness verification required or not, and the rationale for either documented based on the quality impact of the incident?",
  },
  {
    key: "control.interim_plan",
    label: "Interim plan addressed",
    description:
      "Was an interim plan needed to ensure a state of control while preventive actions were implemented? If not, is rationale provided?",
  },
  {
    key: "control.no_preventive_rationale",
    label: "Rationale when no preventive action is identified",
    description: "Was rationale provided when no preventive action was identified?",
  },
  {
    key: "control.final_comments",
    label: "Final comments support conclusion of investigation and CAPA",
    description:
      "Do the final comments include rationale to support the conclusion of the investigation and CAPA?",
  },
  {
    key: "control.impact_fields_complete",
    label:
      "Impact assessment fields complete (Regulatory, Product Quality, Validation, Stability, Market/Clinical)",
    description: "Was each of the impact assessment fields completed correctly?",
  },
  {
    key: "control.lot_disposition",
    label: "Recommended lot disposition matches conclusions",
    description:
      "Does the recommended lot disposition match the conclusions of the investigation and impact assessment?",
  },
  {
    key: "control.conclusion_final_decision",
    label: "Conclusion includes final decision and rationale",
    description:
      "Does the conclusion include final decision and rationale (e.g., whether regulatory notification is required)?",
  },
  {
    key: "control.capa_verified",
    label: "CAPA verified complete prior to lot disposition",
    description:
      "CAPA required to release material or batches has been verified to be complete and closed prior to material or batch disposition; or a documented explanation is provided for any related open CAPA with no impact.",
  },
  {
    key: "control.conclusion_summary",
    label: "Conclusion includes summary of root cause, scope/impact, lot details",
    description:
      "Does the conclusion include a brief summary of root cause, final scope/impact including rationale for product/material disposition, impact assessment and relevant lot/material/equipment details?",
  },
  {
    key: "control.preventive_achievable",
    label: "Preventive actions achievable",
    description:
      "Are the identified preventive actions achievable based on the information provided?",
  },
];

export const CRITERIA_BY_SECTION: Partial<Record<SectionType, CriterionDefinition[]>> = {
  define: DEFINE_CRITERIA,
  measure: MEASURE_CRITERIA,
  analyze: ANALYZE_CRITERIA,
  improve: IMPROVE_CRITERIA,
  control: CONTROL_CRITERIA,
};

export const EVALUATABLE_SECTIONS: SectionType[] = [
  "define",
  "measure",
  "analyze",
  "improve",
  "control",
];

export function getCriteria(section: SectionType): CriterionDefinition[] {
  return CRITERIA_BY_SECTION[section] ?? [];
}
