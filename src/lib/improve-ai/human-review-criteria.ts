export type HumanReviewCriterionCopy = {
  label: string;
  description: string;
};

/**
 * Human-review UI copy (Untitled-2). Separate from `src/lib/ai/criteria.ts`, which
 * remains the source of truth for AI evaluation prompts.
 */
export const HUMAN_REVIEW_CRITERIA_BY_KEY: Record<string, HumanReviewCriterionCopy> = {
  "define.what_happened": {
    label: "Clearly define what happens actually.",
    description: "Clearly define what happens actually.",
  },
  "define.what_is_different": {
    label: "Explain what is different than expected.",
    description: "Explain what is different than expected.",
  },
  "define.location": {
    label: "Mention the location where the deviation has occurred.",
    description: "Mention the location where the deviation has occurred.",
  },
  "define.datetime": {
    label: "Date/time of deviation occurrence and date/time of detection.",
    description: "Date/time of deviation occurrence and date/time of detection.",
  },
  "define.personnel": {
    label: "Mention the name of personnel who is involved in the deviation.",
    description: "Mention the name of personnel who is involved in the deviation.",
  },
  "define.initial_scope": {
    label:
      "Mention initial scope of deviation (i.e., impacted product/Material/Equipment/System/Batches/etc.)",
    description:
      "Mention initial scope of deviation (i.e., impacted product/Material/Equipment/System/Batches/etc.)",
  },
  "measure.facts_data": {
    label: "Relevant facts and data reviewed",
    description:
      "Does the summary provide relevant facts and data/information that was reviewed including: environment, process/product history, personnel info (title and job title), controls limits, etc.",
  },
  "measure.analysis_summary": {
    label: "Is a summary of the analysis of the factors and data provided?",
    description: "Is a summary of the analysis of the factors and data provided?",
  },
  "measure.conclusion_statement": {
    label: "Is a conclusion statement of the analysis and review provided?",
    description: "Is a conclusion statement of the analysis and review provided?",
  },
  "measure.regulatory_notification": {
    label: "If there were Regulatory Notification, were details provided?",
    description: "If there were Regulatory Notification, were details provided?",
  },
  "measure.logical_flow": {
    label: "Is the report written in a logical flow and easily understood by the reader?",
    description: "Is the report written in a logical flow and easily understood by the reader?",
  },
  "improve.specific_actions": {
    label:
      "Were specific corrective Actions identified (including applicable Immediate Actions) to remediate the current issue or situation such that the associated system was returned to a state of control/compliance?",
    description:
      "Were specific corrective Actions identified (including applicable Immediate Actions) to remediate the current issue or situation such that the associated system was returned to a state of control/compliance?",
  },
  "improve.per_root_cause": {
    label:
      "Were specific Corrective Actions identified for each root cause /substantiated probable root cause, as applicable?",
    description:
      "Were specific Corrective Actions identified for each root cause /substantiated probable root cause, as applicable?",
  },
  "improve.tracking_fields": {
    label:
      "Was the Corrective action assigned a unique number, responsible person and due date so it can be tracked?",
    description:
      "Was the Corrective action assigned a unique number, responsible person and due date so it can be tracked?",
  },
  "improve.expected_outcome": {
    label: "Does the action describe what will be the expected outcome they can be verified?",
    description: "Does the action describe what will be the expected outcome they can be verified?",
  },
  "improve.effectiveness": {
    label:
      "Was Effectiveness Verification required or not and the rationale for either documented based within the quality impact of the deviation after the investigation concluded?",
    description:
      "Was Effectiveness Verification required or not and the rationale for either documented based within the quality impact of the deviation after the investigation concluded?",
  },
  "improve.achievable": {
    label: "Are the identified corrective actions achievable based on the information provided?",
    description:
      "Are the identified corrective actions achievable based on the information provided?",
  },
  "control.preventive_per_root_cause": {
    label:
      "Were specific Preventive Actions identified for each root cause / substantiated probable root cause as applicable?",
    description:
      "Were specific Preventive Actions identified for each root cause / substantiated probable root cause as applicable?",
  },
  "control.linked_to_root_cause": {
    label:
      "Was the Preventive Action linked the classification of the root cause and explanation given for how it will prevent recurrence?",
    description:
      "Was the Preventive Action linked the classification of the root cause and explanation given for how it will prevent recurrence?",
  },
  "control.tracking_fields": {
    label:
      "Was the Preventive action assigned a unique number, responsible person and due date so it can be tracked?",
    description:
      "Was the Preventive action assigned a unique number, responsible person and due date so it can be tracked?",
  },
  "control.expected_outcome": {
    label: "Does the action describe and expected outcome can be verified?",
    description: "Does the action describe and expected outcome can be verified?",
  },
  "control.effectiveness": {
    label:
      "Was Effectiveness Verification required or not and the rationale for either documented based on the quality impact of the incident after the investigation concluded?",
    description:
      "Was Effectiveness Verification required or not and the rationale for either documented based on the quality impact of the incident after the investigation concluded?",
  },
  "control.interim_plan": {
    label:
      "Was an Interim Plan needed to ensure a state the control while the Preventive Actions were implemented?",
    description:
      "Was an Interim Plan needed to ensure a state the control while the Preventive Actions were implemented?",
  },
  "control.no_preventive_rationale": {
    label: "Was rationale provided when no Preventive Action were identified?",
    description: "Was rationale provided when no Preventive Action were identified?",
  },
  "control.final_comments": {
    label:
      "Does the Final Comments section include rotational to support the conclusion of the investigation and CAPA.",
    description:
      "Does the Final Comments section include rotational to support the conclusion of the investigation and CAPA.",
  },
  "control.impact_fields_complete": {
    label:
      "Was each of the impact assessment fields completed correctly - Regulatory Impact, Regulatory notification   Product Quality, Validation, Stability, Market/Clinical?",
    description:
      "Was each of the impact assessment fields completed correctly - Regulatory Impact, Regulatory notification   Product Quality, Validation, Stability, Market/Clinical?",
  },
  "control.lot_disposition": {
    label:
      "Does the Recommended Lot disposition match the conclusions of the investigation and Impact assessment?",
    description:
      "Does the Recommended Lot disposition match the conclusions of the investigation and Impact assessment?",
  },
  "control.conclusion_final_decision": {
    label:
      "Does the Conclusion include final decision and rationale other regulatory notification required?",
    description:
      "Does the Conclusion include final decision and rationale other regulatory notification required?",
  },
  "control.capa_verified": {
    label:
      "CAPA required to release material or batches have been verified to be complete and closed prior to material or batch disposition. Any related CAPA that remain open, but have no impact on the material or batch release and a documented explanation is provided.",
    description:
      "CAPA required to release material or batches have been verified to be complete and closed prior to material or batch disposition. Any related CAPA that remain open, but have no impact on the material or batch release and a documented explanation is provided.",
  },
  "control.conclusion_summary": {
    label:
      "Does the Conclusion include a brief summary of root cause, final scope/impact including rationale for product/material disposition, impact assessment and relevant lot/material/equipment details?",
    description:
      "Does the Conclusion include a brief summary of root cause, final scope/impact including rationale for product/material disposition, impact assessment and relevant lot/material/equipment details?",
  },
  "control.preventive_achievable": {
    label: "Are the identified preventive actions achievable based on the information provided?",
    description:
      "Are the identified preventive actions achievable based on the information provided?",
  },
};

export function getHumanReviewCriterion(
  criterionKey: string
): HumanReviewCriterionCopy | undefined {
  return HUMAN_REVIEW_CRITERIA_BY_KEY[criterionKey];
}

/** Prefer human-review copy when defined; otherwise use stored session fields (e.g. analyze). */
export function resolveHumanReviewCriterionDisplay(
  criterionKey: string,
  stored: HumanReviewCriterionCopy
): HumanReviewCriterionCopy {
  return getHumanReviewCriterion(criterionKey) ?? stored;
}
