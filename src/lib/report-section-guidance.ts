import type { SectionType } from "@/db/schema";

/** Template checkpoint copy for blank report seeding and export — not the AI evaluation rubric. */
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
    "Is a specific corrective Actions identified (including applicable Immediate Actions) to remediate the current issue or situation such that the associated system was returned to a state of control/compliance and also it will avoid the recurrence of deviation?",
    "Is specific Corrective Actions identified for each root cause /substantiated probable root cause, as applicable?",
    "Is the Corrective action assigned a unique number, responsible person and due date so it can be tracked? Does the action describe what will be the expected outcome they can be verified?",
    "Are the identified corrective actions achievable based on the information provided?",
  ],
  control: [
    "Is specific Preventive Actions identified for each root cause /substantiated probable root cause as applicable?",
    "Is the Preventive Action linked the classification of the root cause and explanation given for how it will prevent occurrence?",
    "Is the Preventive action assigned a unique number, responsible person and due date so it can be tracked? Does the action describe and expected outcome can be verified?",
    "Is an Interim Plan needed to ensure a state the control while the Preventive Actions were implemented?",
    "Is rationale provided when no Preventive Action were identified?",
    "Does the Final Comments section include rotational to support the conclusion of the investigation and CAPA",
    "Is each of the impact assessment fields completed correctly — Regulatory Impact, Regulatory notification Product Quality, Validation, Stability, Market/Clinical?",
    "Does the Recommended Lot disposition match the conclusions of the investigation and Impact assessment?",
    "Does the Conclusion include final decision and rationale other regulatory notification required?",
    "CAPA required to release material or batches have been verified to be complete and closed prior to material or batch disposition. Any related CAPA that remain open, but have no impact on the material or batch release and a documented explanation is provided.",
    "Does the Conclusion include a brief summary of root cause, final scope/impact including rationale for product/material disposition, impact assessment and relevant lot/material/equipment details?",
    "Are the identified preventive actions achievable based on the information provided?",
  ],
};

export const IMPROVE_SECTION_HEADER =
  "Improve: Improve section covers the corrective actions";
export const IMPROVE_SECTION_INTRO =
  "Following checkpoint shall be considered as guidance only while finalizing the corrective actions,";
export const CONTROL_SECTION_HEADER =
  "Control: Control section covers the preventive actions";
export const CONTROL_SECTION_INTRO =
  "Following checkpoint shall be considered as guidance only ,";

/** Last default improve checklist line — narrative follows this when no action label is stored. */
export const IMPROVE_LAST_CHECKPOINT_MARKER =
  "Are the identified corrective actions achievable based on the information provided?";

/** Last default control checklist line — narrative follows this when no action label is stored. */
export const CONTROL_LAST_CHECKPOINT_MARKER =
  "Are the identified preventive actions achievable based on the information provided?";

function numberedChecklist(items: string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

/** Plain-text preamble seeded into blank reports (matches Word template structure). */
export function buildDefaultGuidancePreamble(section: SectionType): string {
  const items = SECTION_GUIDANCE[section];
  if (!items?.length) return "";

  if (section === "improve") {
    return [
      IMPROVE_SECTION_HEADER,
      IMPROVE_SECTION_INTRO,
      numberedChecklist(items),
      "",
    ].join("\n");
  }

  if (section === "control") {
    return [
      CONTROL_SECTION_HEADER,
      CONTROL_SECTION_INTRO,
      numberedChecklist(items),
      "",
    ].join("\n");
  }

  const sectionTitle = section.charAt(0).toUpperCase() + section.slice(1);
  return [
    `Following checks shall be considered while writing the "${sectionTitle}" section.`,
    numberedChecklist(items),
    "",
  ].join("\n");
}
