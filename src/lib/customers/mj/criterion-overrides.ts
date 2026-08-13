/**
 * MJ criterion descriptions overlaid on the shared investigation list.
 * Keys must exist in `src/lib/ai/criteria.ts` — unknown keys fail at apply time.
 */
export const MJ_CRITERION_DESCRIPTION_OVERRIDES: Readonly<Record<string, string>> = {
  "define.what_happened":
    "Does the narrative clearly describe the actual event in concrete, factual terms — " +
    "including the specific activity being performed, the instrument/equipment involved " +
    "(with ID when applicable; for SCADA, the system name such as AGLTS SCADA is sufficient " +
    "without an E/PR equipment code or version number), and the exact observation or result obtained? " +
    "Vague statements like 'it was observed that results were out of spec' are insufficient; " +
    "the narrative must state what was being done, on what equipment, and what specifically " +
    "was observed (e.g., 'obtained SST result of 115.1% Recovery of Benzoquinone').",
  "define.what_is_different":
    "Does the narrative explicitly state both the expected standard/acceptance criteria " +
    "AND the observed deviation from it, with reference to the governing SOP No. " +
    "(revision number is not required) and relevant section number? " +
    "For example, stating 'not within acceptance criteria as per SOP/DP/QC/045' is " +
    "insufficient — the narrative must cite the SOP No. and section " +
    "(e.g., 'As per SOP No.: SOP/DP/QC/045, " +
    "Section No.: 7.4.3.26, the results must not be less than 85% & must not be more " +
    "than 115%').",
  "define.location":
    "Is a specific physical location identified, including the room name/number or area " +
    "code (e.g., 'Instrument Lab - II (FF-16)', 'Filling Room (GF-89)')? " +
    "Simply stating the department or omitting the location entirely is insufficient. " +
    "The location must be precise enough to trace the deviation to a specific area " +
    "within the facility.",
  "define.datetime":
    "Does the narrative specify both the date AND time (in HH:MM format) of when the " +
    "deviation occurred, and separately when it was detected/identified? " +
    "Stating only the date (e.g., 'On 13/03/2026') without the time is insufficient. " +
    "Stating only a month or year (e.g., 'scheduled for 2025' instead of " +
    "'scheduled for February 2025') is also insufficient. " +
    "Both occurrence and detection timestamps must be present with appropriate precision.",
  "define.personnel":
    "Are the personnel who performed the activity, observed the deviation, or are " +
    "otherwise involved identified by their Employee ID (Emp. ID) only? " +
    "Generic references such as 'the analyst', 'the operator', or 'the auditor' without " +
    "an Emp. ID are insufficient, and names, roles, titles, or job functions are not required. " +
    "Each person mentioned must include their Emp. ID (e.g., 'Emp. ID: 615', " +
    "'Emp. ID: 1089', 'Emp. ID: 562 and Emp. ID: 252').",
  "define.initial_scope":
    "Is the initial scope of impact explicitly stated, including specific identifiers " +
    "such as batch numbers, equipment IDs, instrument IDs, affected departments, or " +
    "material names? " +
    "The scope must clearly delineate what is affected and what is not " +
    "(e.g., 'The scope of the deviation was limited to Batch No. B092542503'). " +
    "Vague scope statements without specific identifiers are insufficient. " +
    "For SCADA-related scope, naming the system (e.g., AGLTS SCADA) and the affected " +
    "time periods or functions is sufficient; a site equipment ID (E/PR/xxx) or version " +
    "number for the SCADA system is not required.",
  "measure.facts_data":
    "Does the summary provide relevant facts and data reviewed including environment, " +
    "process/product history, control limits, etc? If personnel are referenced, Emp. ID " +
    "is sufficient; names, titles, and job functions are not required.",
  "analyze.sixm_completeness":
    "6M and 5-Why are alternative root-cause tools; either one, meaningfully " +
    "completed, satisfies the Analyze section. Mark this criterion 'met' when " +
    "6M is the active tool and all six fields (Man, Machine, Measurement, " +
    "Material, Method, Milieu) are filled with an answer (even if 'Not " +
    "Applicable') and a conclusion is provided. Also mark it 'met' when the " +
    "investigation explicitly relies on 5-Why and 6M is documented as 'Not " +
    "Applicable' with a brief rationale.",
  "analyze.fivewhy_completeness":
    "6M and 5-Why are alternative root-cause tools; either one, meaningfully " +
    "completed, satisfies the Analyze section. (Methodology detail—including that " +
    "the count of “why” steps is not fixed—is in the system prompt.) Mark this " +
    "criterion 'met' when 5-Why is the active tool, each question is derived " +
    "from facts in Define/Measure (not generic), each answer introduces new " +
    "evidence, and a clear conclusion is provided. Also mark it 'met' when the " +
    "investigation explicitly relies on 6M and 5-Why is documented as 'Not " +
    "Applicable' with a brief rationale.",
  "analyze.root_cause":
    "Is the primary, secondary, and third level root cause identified per SOP?",
  "analyze.impact_assessment":
    "Is the impact assessment filled for all five fields with a clear statement for each?",
  "control.tracking_fields":
    "Was the preventive action assigned a unique tracking number (CAPA No., Work Order No., " +
    "or Breakdown No.), responsible person by Emp. ID, and due date so it can be tracked?",
  "control.interim_plan":
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
};
