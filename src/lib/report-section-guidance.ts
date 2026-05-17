import type { SectionType } from "@/db/schema";

export const SECTION_GUIDANCE: Partial<Record<SectionType, string[]>> = {
  define: [
    "Clearly define what happens actually.",
    "Explain what is different than expected.",
    "Mention the location where the deviation has occurred.",
    "Date/time of deviation occurrence and date/time of detection.",
    "Mention the name of personnel who is involved in the deviation.",
    "Mention initial scope of deviation (i.e., impacted product/Material/Equipment/System/Batches/etc.).",
  ],
  measure: [
    "Does the summary provide relevant facts and data/information that was reviewed including: environment, process/product history, personnel info (title and job title), controls limits, etc.",
    "Is a summary of the analysis of the factors and data provided?",
    "Is a conclusion statement of the analysis and review provided?",
    "If there were Regulatory Notification, were details provided?",
    "Is the report written in a logical flow and easily understood by the reader?",
  ],
  improve: [
    "Were specific corrective actions identified (including applicable immediate actions) to remediate the current issue or situation such that the associated system was returned to a state of control/compliance?",
    "Were specific corrective actions identified for each root cause / substantiated probable root cause, as applicable?",
    "Was the corrective action assigned a unique number, responsible person and due date so it can be tracked?",
    "Does the action describe what will be the expected outcome that can be verified?",
    "Was effectiveness verification required or not and was the rationale documented based on the quality impact of the deviation after the investigation concluded?",
    "Are the identified corrective actions achievable based on the information provided?",
  ],
  control: [
    "Were specific preventive actions identified for each root cause / substantiated probable root cause as applicable?",
    "Was the preventive action linked to the classification of the root cause and was an explanation given for how it will prevent recurrence?",
    "Was the preventive action assigned a unique number, responsible person and due date so it can be tracked?",
    "Does the action describe an expected outcome that can be verified?",
    "Was effectiveness verification required or not and was the rationale documented?",
    "Are the identified preventive actions achievable based on the information provided?",
  ],
};
