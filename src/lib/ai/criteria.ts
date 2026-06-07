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
      "Does the narrative clearly describe the actual event in concrete, factual terms — " +
      "including the specific activity being performed, the instrument/equipment involved " +
      "(with ID when applicable; for SCADA, the system name such as AGLTS SCADA is sufficient " +
      "without an E/PR equipment code or version number), and the exact observation or result obtained? " +
      "Vague statements like 'it was observed that results were out of spec' are insufficient; " +
      "the narrative must state what was being done, on what equipment, and what specifically " +
      "was observed (e.g., 'obtained SST result of 115.1% Recovery of Benzoquinone').",
  },
  {
    key: "define.what_is_different",
    label: "Explain what is different than expected",
    description:
      "Does the narrative explicitly state both the expected standard/acceptance criteria " +
      "AND the observed deviation from it, with reference to the governing SOP No. " +
      "(revision number is not required) and relevant section number? " +
      "For example, stating 'not within acceptance criteria as per SOP/DP/QC/045' is " +
      "insufficient — the narrative must cite the SOP No. and section " +
      "(e.g., 'As per SOP No.: SOP/DP/QC/045, " +
      "Section No.: 7.4.3.26, the results must not be less than 85% & must not be more " +
      "than 115%').",
  },
  {
    key: "define.location",
    label: "Mention the location where the deviation occurred",
    description:
      "Is a specific physical location identified, including the room name/number or area " +
      "code (e.g., 'Instrument Lab - II (FF-16)', 'Filling Room (GF-89)')? " +
      "Simply stating the department or omitting the location entirely is insufficient. " +
      "The location must be precise enough to trace the deviation to a specific area " +
      "within the facility.",
  },
  {
    key: "define.datetime",
    label: "Date/time of occurrence and date/time of detection",
    description:
      "Does the narrative specify both the date AND time (in HH:MM format) of when the " +
      "deviation occurred, and separately when it was detected/identified? " +
      "Stating only the date (e.g., 'On 13/03/2026') without the time is insufficient. " +
      "Stating only a month or year (e.g., 'scheduled for 2025' instead of " +
      "'scheduled for February 2025') is also insufficient. " +
      "Both occurrence and detection timestamps must be present with appropriate precision.",
  },
  {
    key: "define.personnel",
    label: "Personnel involved in the deviation",
    description:
      "Are the personnel who performed the activity, observed the deviation, or are " +
      "otherwise involved identified by their Employee ID (Emp. ID) only? " +
      "Generic references such as 'the analyst', 'the operator', or 'the auditor' without " +
      "an Emp. ID are insufficient, and names, roles, titles, or job functions are not required. " +
      "Each person mentioned must include their Emp. ID (e.g., 'Emp. ID: 615', " +
      "'Emp. ID: 1089', 'Emp. ID: 562 and Emp. ID: 252').",
  },
  {
    key: "define.initial_scope",
    label: "Initial scope (impacted product/material/equipment/system/batches)",
    description:
      "Is the initial scope of impact explicitly stated, including specific identifiers " +
      "such as batch numbers, equipment IDs, instrument IDs, affected departments, or " +
      "material names? " +
      "The scope must clearly delineate what is affected and what is not. " +
      "Rating: generic category without specific IDs (e.g., 'semi-finished and finished " +
      "product batches were stored' without listing which batches) → partially_met; " +
      "named batches (e.g., 'scope limited to Batch No. X, Y, Z') → met; " +
      "completely omitting scope → not_met. " +
      "For SCADA-related scope, naming the system (e.g., AGLTS SCADA) and the affected " +
      "time periods or functions is sufficient; a site equipment ID (E/PR/xxx) or version " +
      "number for the SCADA system is not required.",
  },
];

export const MEASURE_CRITERIA: CriterionDefinition[] = [
  {
    key: "measure.facts_data",
    label:
      "Relevant facts and data reviewed (environment, process/product history, control limits)",
    description:
      "Does the summary provide relevant facts and data reviewed including environment, " +
      "process/product history, control limits, etc? If personnel are referenced, Emp. ID " +
      "is sufficient; names, titles, and job functions are not required.",
  },
  {
    key: "measure.analysis_summary",
    label: "Summary of analysis of factors and data provided",
    description:
      "Is a summary of the analysis of the factors and data provided?",
  },
  {
    key: "measure.conclusion_statement",
    label: "Conclusion statement of the analysis and review",
    description:
      "Is a clear conclusion statement of the analysis and review provided?",
  },
  {
    key: "measure.regulatory_notification",
    label: "Regulatory notification details (if applicable)",
    description:
      "If there were regulatory notifications, are the details provided? " +
      "If not applicable, is that explicit?",
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
      "6M and 5-Why are alternative root-cause tools; either one, meaningfully " +
      "completed, satisfies the Analyze section. Mark this criterion 'met' when " +
      "6M is the active tool and all six fields (Man, Machine, Measurement, " +
      "Material, Method, Milieu) are filled with an answer (even if 'Not " +
      "Applicable') and a conclusion is provided. Also mark it 'met' when the " +
      "investigation explicitly relies on 5-Why and 6M is documented as 'Not " +
      "Applicable' with a brief rationale.",
  },
  {
    key: "analyze.fivewhy_completeness",
    label: "5-Why approach completeness",
    description:
      "6M and 5-Why are alternative root-cause tools; either one, meaningfully " +
      "completed, satisfies the Analyze section. Apply the 5-WHY COMPLETENESS STANDARD " +
      "in the system prompt. Mark 'met' when 5-Why is the active tool, the chain starts " +
      "from the specific observed deviation in Define/Measure (not a generic statement), " +
      "each question is derived from section facts, and a clear conclusion is provided. " +
      "Mark 'partially_met' when the chain reaches a plausible root cause but contains " +
      "speculative or skipped intermediate steps. Mark 'not_met' when the chain is " +
      "circular, repeats wording, or the conclusion contradicts the chain. Also mark " +
      "'met' when the investigation relies on 6M and 5-Why is documented as 'Not " +
      "Applicable' with a brief rationale.",
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
    label:
      "Impact assessment (System/Document/Product/Equipment/Patient safety)",
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
      "Were specific corrective actions identified to remediate the current issue such " +
      "that the associated system was returned to a state of control/compliance?",
  },
  {
    key: "improve.per_root_cause",
    label:
      "Corrective actions for each root cause / substantiated probable root cause",
    description:
      "Were specific corrective actions identified for each root cause / substantiated " +
      "probable root cause, as applicable? When prior section context includes Analyze, " +
      "compare against root causes identified there. Each contributing factor should be " +
      "addressed by at least one action; actions targeting a different issue → not_met.",
  },
  {
    key: "improve.tracking_fields",
    label: "Unique number, responsible person, and due date assigned",
    description:
      "Was the corrective action assigned a unique number, responsible person and due " +
      "date so it can be tracked?",
  },
  {
    key: "improve.expected_outcome",
    label: "Expected outcome described and verifiable",
    description:
      "Does the action describe the expected outcome that can be verified?",
  },
  {
    key: "improve.effectiveness",
    label: "Effectiveness verification documented",
    description:
      "Was effectiveness verification required or not, and the rationale for either " +
      "documented?",
  },
  {
    key: "improve.achievable",
    label: "Actions achievable",
    description:
      "Are the identified corrective actions achievable based on the information " +
      "provided?",
  },
];

export const CONTROL_CRITERIA: CriterionDefinition[] = [
  {
    key: "control.preventive_per_root_cause",
    label:
      "Preventive actions for each root cause / substantiated probable root cause",
    description:
      "Were specific preventive actions identified for each root cause / substantiated " +
      "probable root cause as applicable? When prior section context includes Analyze, " +
      "each root cause there should be addressed by at least one preventive action.",
  },
  {
    key: "control.linked_to_root_cause",
    label: "Linked to the classification of the root cause",
    description:
      "Was the preventive action linked to the classification of the root cause and " +
      "explanation given for how it will prevent recurrence? When prior section context " +
      "includes Analyze, actions must trace to an identified root cause there — " +
      "otherwise not_met.",
  },
  {
    key: "control.tracking_fields",
    label: "Unique number, responsible person, due date assigned",
    description:
      "Was the preventive action assigned a unique tracking number (CAPA No., Work Order No., " +
      "or Breakdown No.), responsible person by Emp. ID, and due date so it can be tracked?",
  },
  {
    key: "control.expected_outcome",
    label: "Expected outcome verifiable",
    description:
      "Does the action describe an expected outcome that can be verified?",
  },
  {
    key: "control.effectiveness",
    label: "Effectiveness verification documented",
    description:
      "Was effectiveness verification required or not, and the rationale for either " +
      "documented based on the quality impact of the incident? " +
      "When required, a complete verification statement must address: when verification starts, " +
      "over how many cycles or what time period, the specific measurable acceptance criterion, " +
      "and who is responsible. " +
      "A tracking reference number alone (e.g., 'Effectiveness Check Number') is not a verification method. " +
      "Mark partially_met if any of these elements is missing or too vague to be actionable.",
  },
  {
    key: "control.interim_plan",
    label: "Interim plan addressed",
    description:
      "Was an interim plan needed to ensure a state of control while preventive " +
      "actions were implemented? If not, is rationale provided? " +
      "An interim plan is only needed when residual risk persists during the implementation gap " +
      "(e.g., the deviation is ongoing, the instrument or process remains at risk, or the CAPA " +
      "timeline is long enough that recurrence is plausible in the interim). " +
      "If the issue has already been corrected and the permanent fix (e.g., SOP revision) will be " +
      "completed before the next opportunity for recurrence, stating 'no interim plan required' " +
      "with that rationale is correct and sufficient. " +
      "Do NOT restate the preventive action itself as an informal verbal instruction and call it an interim plan — " +
      "that duplicates the fix rather than bridging the gap.",
  },
  {
    key: "control.no_preventive_rationale",
    label: "Rationale when no preventive action is identified",
    description:
      "This criterion is ONLY relevant when the section identifies zero preventive actions. " +
      "If any preventive action is described — even if imperfectly structured or missing tracking fields — " +
      "mark this criterion 'met' immediately; do not evaluate formality or completeness here " +
      "(those belong to control.preventive_per_root_cause and control.tracking_fields). " +
      "Only mark not_met when the section genuinely contains no preventive action AND provides " +
      "no rationale for why one was not identified.",
  },
  {
    key: "control.final_comments",
    label: "Final comments support conclusion of investigation and CAPA",
    description:
      "Do the final comments include rationale to support the conclusion of the " +
      "investigation and CAPA?",
  },
  {
    key: "control.impact_fields_complete",
    label:
      "Impact assessment fields complete (Regulatory, Product Quality, Validation, " +
      "Stability, Market/Clinical)",
    description:
      "Was each of the impact assessment fields completed correctly?",
  },
  {
    key: "control.lot_disposition",
    label: "Recommended lot disposition matches conclusions",
    description:
      "Does the recommended lot disposition match the conclusions of the investigation " +
      "and impact assessment?",
  },
  {
    key: "control.conclusion_final_decision",
    label: "Conclusion includes final decision and rationale",
    description:
      "Does the conclusion include final decision and rationale (e.g., whether " +
      "regulatory notification is required)?",
  },
  {
    key: "control.capa_verified",
    label: "CAPA verified complete prior to lot disposition",
    description:
      "CAPA required to release material or batches has been verified to be complete " +
      "and closed prior to material or batch disposition; or a documented explanation " +
      "is provided for any related open CAPA with no impact.",
  },
  {
    key: "control.conclusion_summary",
    label: "Conclusion includes summary of root cause, scope/impact, lot details",
    description:
      "Does the conclusion include a brief summary of root cause, final scope/impact " +
      "including rationale for product/material disposition, impact assessment and " +
      "relevant lot/material/equipment details?",
  },
  {
    key: "control.preventive_achievable",
    label: "Preventive actions achievable",
    description:
      "Are the identified preventive actions achievable based on the information " +
      "provided?",
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
