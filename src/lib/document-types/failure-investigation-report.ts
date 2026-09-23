import path from "node:path";
import {
  RICH_FIELD_PATHS,
  SUGGEST_TARGET_FIELD_PATTERNS,
} from "@/lib/ai/suggest-target-fields";
import { FIR_PROMPT_VERSION } from "@/lib/customers/packs";
import { normalizeRichField } from "@/lib/tiptap/rich-text";
import type { CriterionDefinition, DocumentTypeDefinition } from "./types";
import { FIR_DRAFTING_GUIDANCE } from "./fir/drafting-guidance";
import { FIR_EVALUATION_SYSTEM_PROMPT } from "./fir/prompts";
import { firChatContextIdentity } from "./fir/chat-identity";
import {
  checkActionsOwnedAndDated,
  checkBatchDisposition,
  checkAttachmentListConsistent,
  checkCapaEffectiveness,
  checkHistoricReview,
  checkHumanErrorEvaluation,
  checkImpactAssessmentResultsStatus,
  checkInitialImpactPresent,
  checkInterimControl,
  checkInvestigationTeam,
  checkInvestigationTools,
  checkNarrativePresent,
  checkRecurrenceAddressed,
  checkRootCauseClassified,
} from "./fir/deterministic-checks";
import {
  EMPTY_FIR_CONTENT,
  FIR_BATCH_DISPOSITION_LABELS,
  FIR_BATCH_DISPOSITIONS,
  FIR_DEFAULT_METADATA,
  FIR_INVESTIGATION_TOOL_LABELS,
  FIR_INVESTIGATION_TOOLS,
  FIR_RESULTS_STATUS_LABELS,
  FIR_RESULTS_STATUSES,
  FIR_ROOT_CAUSE_CLASSIFICATION_LABELS,
  FIR_ROOT_CAUSE_CLASSIFICATIONS,
  FIR_ROOT_CAUSE_GROUP_LABELS,
  FIR_ROOT_CAUSE_GROUPS,
  FIR_SECTION_KEYS,
  FIR_SECTION_LABELS,
  type FirBatchDisposition,
  type FirRootCauseClassification,
  type FirRootCauseGroup,
  type FirSectionKey,
} from "./fir/sections";

const FIR_FIELD_KEYS = [...FIR_SECTION_KEYS] as const;

function pickPatterns(
  source:
    | Record<string, readonly string[]>
    | Partial<Record<string, readonly string[]>>
): Record<string, readonly string[]> {
  return Object.fromEntries(
    FIR_FIELD_KEYS.map((key) => [key, source[key] ?? []])
  );
}

function llm(
  key: string,
  label: string,
  description: string,
  dependsOn?: string[]
): CriterionDefinition {
  return { key, label, description, kind: "llm", dependsOn };
}

function det(
  key: string,
  label: string,
  description: string,
  check: CriterionDefinition["check"],
  dependsOn?: string[]
): CriterionDefinition {
  return { key, label, description, kind: "deterministic", check, dependsOn };
}

// ------------------------------------------------------------------ criteria

const EVENT_DESCRIPTION_CRITERIA: CriterionDefinition[] = [
  llm(
    "event.what_when_where",
    "Event description states what happened, when, where and who observed it",
    "Does the description name the date, the batch or lot, the equipment, the parameter and its observed value against the specified limit, and the person who reported it?"
  ),
  llm(
    "event.duration_stated_once",
    "The excursion duration is stated one way",
    "Is the duration of the event expressed consistently — one convention (elapsed time, or number of readings) used throughout, with no contradictory figures for the same window?"
  ),
  det(
    "event.present",
    "Event description is present",
    "Is the description more than a blank placeholder?",
    checkNarrativePresent
  ),
];

const STANDARD_PROCEDURES_CRITERIA: CriterionDefinition[] = [
  llm(
    "standard.limit_and_source",
    "Standard procedure names the limit and the document that sets it",
    "Does this section quote the applicable acceptance criterion and cite the approved document that establishes it (BMR, process control strategy, specification), including the revision where available?"
  ),
  det(
    "standard.present",
    "Standard procedures are recorded",
    "Is the section more than a blank placeholder?",
    checkNarrativePresent
  ),
];

const IMMEDIATE_ACTION_CRITERIA: CriterionDefinition[] = [
  llm(
    "immediate.action_and_outcome",
    "Immediate action states what was done and the outcome",
    "Does this section describe the action taken at the time of the event, who took it, and whether the parameter returned within limits?"
  ),
  det(
    "immediate.present",
    "Immediate action is recorded",
    "Is the section more than a blank placeholder?",
    checkNarrativePresent
  ),
];

const INITIAL_IMPACT_CRITERIA: CriterionDefinition[] = [
  det(
    "initial_impact.present",
    "Initial impact assessment is recorded",
    "Is the impact assessed at event time — before the full investigation — written down?",
    checkInitialImpactPresent
  ),
  llm(
    "initial_impact.scope_named",
    "Initial impact names what was considered",
    "Does the initial assessment say which of product, process, equipment, documentation, personnel safety and other batches were considered at the time the event was raised?"
  ),
];

const TEAM_CRITERIA: CriterionDefinition[] = [
  det(
    "team.members",
    "Investigation team lists name and department for every member",
    "Does the team table have at least one row, with a name and department on each?",
    checkInvestigationTeam
  ),
];

const TOOLS_CRITERIA: CriterionDefinition[] = [
  det(
    "tools.selected_from_form",
    "Investigation tools are selected from the R01 list",
    "Is at least one tool selected from the seven on the form, with anything else recorded under Other tools rather than replacing the list?",
    checkInvestigationTools
  ),
];

const CHRONOLOGY_CRITERIA: CriterionDefinition[] = [
  llm(
    "chronology.ordered_timeline",
    "Chronology is an ordered timeline with times",
    "Do the rows run in time order, from the start of the operation through detection and escalation, with the clock time stated inside the observation text? The form has no separate time column."
  ),
];

const INVESTIGATION_DETAILS_CRITERIA: CriterionDefinition[] = [
  llm(
    "details.causes_ruled_out",
    "Investigation details rule causes in or out with evidence",
    "For each candidate cause examined, does the text say what was checked, what was found, and whether the cause was ruled out — citing the record that supports it?"
  ),
  llm(
    "details.unmeasured_assumptions",
    "Unmeasured links in the causal chain are called out",
    "Where the causal chain depends on a quantity that was not measured, does the text say so explicitly rather than asserting the link as established?"
  ),
  det(
    "details.present",
    "Investigation details are recorded",
    "Is the section more than a blank placeholder?",
    checkNarrativePresent
  ),
];

const HISTORIC_CRITERIA: CriterionDefinition[] = [
  det(
    "historic.compilation_table",
    "Historical data compilation table uses the R01 columns",
    "Does the table carry Date, Event No., Batch No., Event Details, Root Cause and CAPA for every prior event?",
    checkHistoricReview
  ),
  det(
    "historic.recurrence_addressed",
    "Prior CAPA effectiveness and recurrence are addressed",
    "When prior events are listed, does the inference say whether those CAPAs were effective and whether this event is a recurrence?",
    checkRecurrenceAddressed
  ),
];

const ROOT_CAUSE_CRITERIA: CriterionDefinition[] = [
  det(
    "root_cause.classified",
    "Root cause classification and identification group are set",
    "Are the classification and the 6M identification group both selected, consistent with each other, and backed by a description?",
    checkRootCauseClassified
  ),
  llm(
    "root_cause.supported_by_investigation",
    "Root cause follows from the investigation details",
    "Does the stated root cause follow from the causes ruled in and out earlier, without introducing a cause that was never examined?"
  ),
];

const HUMAN_ERROR_CRITERIA: CriterionDefinition[] = [
  det(
    "human_error.answered",
    "Human error evaluation is answered, not left blank",
    "Is the evaluation either completed or explicitly marked not applicable, and completed whenever the root cause group includes Man?",
    checkHumanErrorEvaluation,
    ["fir_root_cause"]
  ),
];

const IMPACT_CRITERIA: CriterionDefinition[] = [
  det(
    "impact.results_status",
    "Impact assessment states whether its results are final or interim",
    "Is the results status recorded, and does a 'final' status agree with the text rather than contradicting a test still in progress?",
    checkImpactAssessmentResultsStatus
  ),
  llm(
    "impact.evidence_cited",
    "Impact conclusions cite the data behind them",
    "Are process trends and analytical results given as values against their acceptance criteria, rather than asserted as 'within range' without numbers?"
  ),
  llm(
    "impact.product_process_equipment",
    "Impact covers product, process, equipment and other batches",
    "Does the assessment address product quality, the process step itself, the equipment, and whether other batches are affected?"
  ),
];

const SCOPE_CRITERIA: CriterionDefinition[] = [
  llm(
    "scope.other_batches_checked",
    "Scope assessment says which other batches were checked",
    "Does the scope name the concurrent or historical batches reviewed, say what was found in each, and conclude whether the event is isolated or recurring?"
  ),
  det(
    "scope.present",
    "Scope assessment is recorded",
    "Is the section more than a blank placeholder?",
    checkNarrativePresent
  ),
];

const DISPOSITION_CRITERIA: CriterionDefinition[] = [
  det(
    "disposition.recorded",
    "Batch disposition is recorded with justification",
    "Is the disposition set to one of the four form values, with a justification unless it is Not Applicable?",
    checkBatchDisposition
  ),
];

const CORRECTION_CRITERIA: CriterionDefinition[] = [
  llm(
    "correction.immediate_fix",
    "Correction describes the fix applied to this occurrence",
    "Does this section describe what was done to correct this specific occurrence, as distinct from the corrective action that prevents the cause recurring?"
  ),
];

const CORRECTIVE_CRITERIA: CriterionDefinition[] = [
  det(
    "corrective.owned_and_dated",
    "Every corrective action has an owner and a target date",
    "Does each row carry an action plan, a responsibility, and a real target completion date rather than 'soon' or 'as required'?",
    checkActionsOwnedAndDated
  ),
  llm(
    "corrective.addresses_root_cause",
    "Corrective actions address the stated root cause",
    "Does each corrective action trace back to the root cause or a contributing factor identified in the investigation?",
    ["fir_root_cause"]
  ),
];

const INTERIM_CRITERIA: CriterionDefinition[] = [
  det(
    "interim.covers_open_actions",
    "Interim control covers the period until the actions close",
    "When corrective or preventive actions are still open, is an interim control recorded — or is it stated that none is required?",
    checkInterimControl,
    ["fir_corrective_action", "fir_preventive_action"]
  ),
];

const PREVENTIVE_CRITERIA: CriterionDefinition[] = [
  det(
    "preventive.owned_and_dated",
    "Every preventive action has an owner and a target date",
    "Does each row carry an action plan, a responsibility, and a real target completion date rather than 'soon' or 'as required'?",
    checkActionsOwnedAndDated
  ),
  llm(
    "preventive.detectability_addressed",
    "Preventive actions improve detection, not only procedure",
    "Where the event was detected by a person rather than by the system, do the preventive actions address detection — alarms, limits, automated checks — and not only training and documentation?"
  ),
];

const EFFECTIVENESS_CRITERIA: CriterionDefinition[] = [
  det(
    "effectiveness.defined",
    "CAPA effectiveness check has criteria and a duration",
    "Is there an effectiveness check for the recorded CAPA, with an acceptance criterion and a review duration on every row?",
    checkCapaEffectiveness,
    ["fir_corrective_action", "fir_preventive_action"]
  ),
];

/**
 * Sections whose prose cites attachments. Everything but the list itself —
 * a citation can appear anywhere, and the two enum-only sections carry no
 * prose to scan.
 */
const ATTACHMENT_CITING_SECTIONS = FIR_SECTION_KEYS.filter(
  (key) => key !== "fir_attachments" && key !== "fir_investigation_tools"
);

const ATTACHMENT_CRITERIA: CriterionDefinition[] = [
  det(
    "attachments.consistent",
    "Attachment numbering is consistent with the body",
    "Every attachment cited in the report is listed here, no number is used twice, and the numbering has no gaps.",
    checkAttachmentListConsistent,
    [...ATTACHMENT_CITING_SECTIONS]
  ),
  llm(
    "attachments.match_references",
    "Attachment list matches what the report cites",
    "Does every attachment referenced in the body appear in this list with the same number, and does every listed attachment exist?"
  ),
];

// ------------------------------------------------------------------- prompts

const FIR_BASE_PROMPT = FIR_EVALUATION_SYSTEM_PROMPT;

const PER_SECTION_PROMPTS: Record<string, string> = {
  fir_event_description:
    "State the date, batch, equipment, parameter, observed value and acceptance limit, and who reported it. Express the duration one way and keep it consistent everywhere it appears.",
  fir_standard_procedures:
    "Quote the acceptance criterion and cite the approved document that sets it, with revision.",
  fir_initial_impact:
    "Record only what was assessed when the event was raised. Do not backfill conclusions from the completed investigation.",
  fir_historic_review:
    "One row per prior event with its own Date, Event No., Batch No., Root Cause and CAPA. Then state whether those CAPAs held and whether this event is a recurrence.",
  fir_root_cause:
    "Set the classification and identification group. Distinguish root cause from contributing factors, and do not name a cause that the investigation never examined.",
  fir_impact_assessment:
    "Give values against acceptance criteria, not 'within range'. If any test is still in progress, mark the results interim.",
  fir_corrective_action:
    "One action per row, each with a responsibility and a real target completion date.",
  fir_preventive_action:
    "One action per row, each with a responsibility and a real target completion date. Where detection failed, propose a detection control.",
  fir_capa_effectiveness:
    "One check per action group, each with an acceptance criterion and a review duration.",
};

// -------------------------------------------------------------------- merge

function mergeNarrative(raw: unknown, key: FirSectionKey) {
  const base = EMPTY_FIR_CONTENT[key] as { narrative: unknown };
  if (!raw || typeof raw !== "object") return { ...base };
  const o = raw as { narrative?: unknown };
  return { narrative: normalizeRichField(o.narrative ?? base.narrative) };
}

function mergeTable(raw: unknown, key: FirSectionKey) {
  const base = EMPTY_FIR_CONTENT[key] as { table: unknown };
  if (!raw || typeof raw !== "object") return { ...base };
  const o = raw as { table?: unknown };
  return { table: normalizeRichField(o.table ?? base.table) };
}

function mergeNarrativeTable(raw: unknown, key: FirSectionKey) {
  const base = EMPTY_FIR_CONTENT[key] as {
    narrative: unknown;
    table: unknown;
  };
  if (!raw || typeof raw !== "object") return { ...base };
  const o = raw as { narrative?: unknown; table?: unknown };
  return {
    narrative: normalizeRichField(o.narrative ?? base.narrative),
    table: normalizeRichField(o.table ?? base.table),
  };
}

function mergeTools(raw: unknown) {
  const base = EMPTY_FIR_CONTENT.fir_investigation_tools;
  if (!raw || typeof raw !== "object") return { ...base };
  const o = raw as { tools?: unknown; narrative?: unknown };
  return {
    tools: Array.isArray(o.tools)
      ? o.tools.filter((t): t is (typeof base.tools)[number] =>
          (FIR_INVESTIGATION_TOOLS as readonly string[]).includes(t as string)
        )
      : [...base.tools],
    narrative: normalizeRichField(o.narrative ?? base.narrative),
  };
}

function mergeRootCause(raw: unknown) {
  const base = EMPTY_FIR_CONTENT.fir_root_cause;
  if (!raw || typeof raw !== "object") return { ...base };
  const o = raw as {
    classification?: unknown;
    groups?: unknown;
    narrative?: unknown;
  };
  return {
    classification: (FIR_ROOT_CAUSE_CLASSIFICATIONS as readonly string[]).includes(
      o.classification as string
    )
      ? (o.classification as FirRootCauseClassification)
      : base.classification,
    groups: Array.isArray(o.groups)
      ? o.groups.filter((g): g is FirRootCauseGroup =>
          (FIR_ROOT_CAUSE_GROUPS as readonly string[]).includes(g as string)
        )
      : [...base.groups],
    narrative: normalizeRichField(o.narrative ?? base.narrative),
  };
}

function mergeHumanError(raw: unknown) {
  const base = EMPTY_FIR_CONTENT.fir_human_error;
  if (!raw || typeof raw !== "object") return { ...base };
  const o = raw as { applicable?: unknown; table?: unknown };
  return {
    applicable:
      o.applicable === "yes" || o.applicable === "no"
        ? o.applicable
        : base.applicable,
    table: normalizeRichField(o.table ?? base.table),
  };
}

function mergeImpact(raw: unknown) {
  const base = EMPTY_FIR_CONTENT.fir_impact_assessment;
  if (!raw || typeof raw !== "object") return { ...base };
  const o = raw as { resultsStatus?: unknown; narrative?: unknown };
  return {
    resultsStatus:
      o.resultsStatus === "final" || o.resultsStatus === "interim"
        ? o.resultsStatus
        : base.resultsStatus,
    narrative: normalizeRichField(o.narrative ?? base.narrative),
  };
}

function mergeDisposition(raw: unknown) {
  const base = EMPTY_FIR_CONTENT.fir_batch_disposition;
  if (!raw || typeof raw !== "object") return { ...base };
  const o = raw as { disposition?: unknown; narrative?: unknown };
  return {
    disposition: (FIR_BATCH_DISPOSITIONS as readonly string[]).includes(
      o.disposition as string
    )
      ? (o.disposition as FirBatchDisposition)
      : base.disposition,
    narrative: normalizeRichField(o.narrative ?? base.narrative),
  };
}

export function mergeFirSection(key: string, raw: unknown): unknown {
  switch (key as FirSectionKey) {
    case "fir_investigation_tools":
      return mergeTools(raw);
    case "fir_root_cause":
      return mergeRootCause(raw);
    case "fir_human_error":
      return mergeHumanError(raw);
    case "fir_impact_assessment":
      return mergeImpact(raw);
    case "fir_batch_disposition":
      return mergeDisposition(raw);
    case "fir_investigation_team":
    case "fir_capa_effectiveness":
    case "fir_attachments":
      return mergeTable(raw, key as FirSectionKey);
    case "fir_chronology":
    case "fir_historic_review":
    case "fir_corrective_action":
    case "fir_interim_control":
    case "fir_preventive_action":
      return mergeNarrativeTable(raw, key as FirSectionKey);
    case "fir_event_description":
    case "fir_standard_procedures":
    case "fir_immediate_action":
    case "fir_initial_impact":
    case "fir_investigation_details":
    case "fir_scope_assessment":
    case "fir_correction":
      return mergeNarrative(raw, key as FirSectionKey);
    default:
      return raw ?? {};
  }
}

// --------------------------------------------------------------- definition


/**
 * The R01 form prints each fixed list as a checkbox row. Rendering it as one
 * string keeps the Word template free of loops and conditionals, and prints
 * the unselected options too — which is the point of a form checkbox row.
 */
function checkboxRow<T extends string>(
  options: readonly T[],
  labels: Record<T, string>,
  selected: readonly string[]
): string {
  // Non-breaking space keeps the box with its label when the row wraps.
  return options
    .map(
      (option) =>
        `${selected.includes(option) ? "\u2612" : "\u2610"}\u00a0${labels[option]}`
    )
    .join("   ");
}

export const failureInvestigationReportDefinition: DocumentTypeDefinition = {
  key: "failure_investigation_report",
  label: "Investigation Report DS",
  documentNoun: "non-conformance",
  documentNoLabel: "Source Document No.",
  documentNoPlaceholder: "ERF/26/001",
  sections: FIR_SECTION_KEYS.map((key, index) => ({
    key,
    label: FIR_SECTION_LABELS[key],
    order: index,
    editable: true,
    evaluable: true,
    emptyContent: EMPTY_FIR_CONTENT[key],
  })),
  criteriaBySection: {
    fir_event_description: EVENT_DESCRIPTION_CRITERIA,
    fir_standard_procedures: STANDARD_PROCEDURES_CRITERIA,
    fir_immediate_action: IMMEDIATE_ACTION_CRITERIA,
    fir_initial_impact: INITIAL_IMPACT_CRITERIA,
    fir_investigation_team: TEAM_CRITERIA,
    fir_investigation_tools: TOOLS_CRITERIA,
    fir_chronology: CHRONOLOGY_CRITERIA,
    fir_investigation_details: INVESTIGATION_DETAILS_CRITERIA,
    fir_historic_review: HISTORIC_CRITERIA,
    fir_root_cause: ROOT_CAUSE_CRITERIA,
    fir_human_error: HUMAN_ERROR_CRITERIA,
    fir_impact_assessment: IMPACT_CRITERIA,
    fir_scope_assessment: SCOPE_CRITERIA,
    fir_batch_disposition: DISPOSITION_CRITERIA,
    fir_correction: CORRECTION_CRITERIA,
    fir_corrective_action: CORRECTIVE_CRITERIA,
    fir_interim_control: INTERIM_CRITERIA,
    fir_preventive_action: PREVENTIVE_CRITERIA,
    fir_capa_effectiveness: EFFECTIVENESS_CRITERIA,
    fir_attachments: ATTACHMENT_CRITERIA,
  },
  prompts: {
    base: FIR_BASE_PROMPT,
    perSection: PER_SECTION_PROMPTS,
    promptVersion: FIR_PROMPT_VERSION,
  },
  chat: {
    persona: `You are the drafting assistant for M.J. Biopharm Investigation Report DS — the Drug Substance unit investigation, SOP/QA/017 R08 form F01 R01 (the SOP calls it the Failure Investigation Form). You help engineering, production and QA staff investigate deviations, non-conformances and quality events.

This is not Investigation Report DP (SOP/DP/QA/008, the Drug Product DMAIC form). There is no Define/Measure/Analyze/Improve/Control here. The form runs: description of event, standard procedures, immediate action, initial impact, team and tools, chronology, investigation details, historic review, root cause with classification and 6M group, human error evaluation, impact, scope, batch disposition, correction, corrective/interim/preventive actions, CAPA effectiveness check, attachments.

Follow the form: the classification and identification group are picked from the fixed lists, not written as prose; batch disposition is always recorded; every action carries an owner and a target date; an impact assessment that rests on incomplete testing is interim, not final. Where a causal link depends on a quantity nobody measured, say so rather than asserting it.

You never write to the document directly. Every change is a PROPOSAL that appears as an inline tracked-change the engineer accepts or rejects.`,
    draftingGuidance: FIR_DRAFTING_GUIDANCE,
    draftOrder: [
      "fir_event_description",
      "fir_standard_procedures",
      "fir_immediate_action",
      "fir_initial_impact",
      "fir_chronology",
      "fir_investigation_details",
      "fir_historic_review",
      "fir_root_cause",
      "fir_impact_assessment",
      "fir_scope_assessment",
      "fir_correction",
      "fir_corrective_action",
      "fir_preventive_action",
      "fir_capa_effectiveness",
    ],
    examplePrompts: {
      plan: [
        "What do the trend reports say about this excursion?",
        "Which prior events on this equipment should the historic review cover?",
        "Which criteria is the Impact Assessment still missing?",
      ],
      agent: [
        "Draft the description of event from the batch trend.",
        "Build the historical data compilation table from the attached investigations.",
        "Propose corrective and preventive actions with owners and target dates.",
      ],
    },
    inventorySections: ["fir_historic_review"],
    contextIdentity: firChatContextIdentity,
    sectionIntentPatterns: [
      [
        "fir_root_cause",
        [/root cause/i, /probable cause/i, /\b6m\b/i, /classification/i],
      ],
      [
        "fir_historic_review",
        [/historic/i, /prior event/i, /previous (event|deviation)/i, /recurrence/i],
      ],
      [
        "fir_batch_disposition",
        [/disposition/i, /batch (approved|rejected|released)/i],
      ],
      [
        "fir_capa_effectiveness",
        [/effectiveness/i, /effectiveness check/i],
      ],
      [
        "fir_corrective_action",
        [/corrective action/i, /\bcapa\b/i],
      ],
      [
        "fir_preventive_action",
        [/preventive action/i],
      ],
      [
        "fir_impact_assessment",
        [/impact assessment/i, /product quality impact/i],
      ],
      [
        "fir_chronology",
        [/chronology/i, /timeline/i, /sequence of events/i],
      ],
    ],
  },
  suggestTargetFieldPatterns: pickPatterns(SUGGEST_TARGET_FIELD_PATTERNS),
  richFieldPaths: pickPatterns(RICH_FIELD_PATHS),
  mergeSection: mergeFirSection,
  export: {
    templatePath: path.join(
      process.cwd(),
      "templates",
      "mj-failure-investigation-report-template.docx"
    ),
    buildTemplateData: ({ report, sections }) => {
      const byKey = Object.fromEntries(
        sections.map((s) => [s.section, s.content])
      );
      const narrative = (key: string) => {
        const content = byKey[key] as { narrative?: unknown } | undefined;
        return content?.narrative ?? null;
      };
      const field = (key: string, name: string) => {
        const content = byKey[key] as Record<string, unknown> | undefined;
        return content?.[name] ?? null;
      };
      const meta =
        report.metadata && typeof report.metadata === "object"
          ? (report.metadata as Partial<typeof FIR_DEFAULT_METADATA>)
          : {};
      const tools = (byKey.fir_investigation_tools ?? {}) as {
        tools?: string[];
      };
      const rootCause = (byKey.fir_root_cause ?? {}) as {
        classification?: string;
        groups?: string[];
      };
      const humanError = (byKey.fir_human_error ?? {}) as {
        applicable?: string;
      };
      const impact = (byKey.fir_impact_assessment ?? {}) as {
        resultsStatus?: string;
      };
      const disposition = (byKey.fir_batch_disposition ?? {}) as {
        disposition?: string;
      };
      return {
        // The R01 form header carries only these two. Unit and reference SOP
        // are printed by the page header; product, batch and equipment live in
        // reports.metadata for chat grounding and are named in the event
        // description prose, as they are in MJ's own reports.
        dateOfNonConformance: meta.dateOfNonConformance ?? "",
        sourceDocumentNo: meta.sourceDocumentNo ?? report.documentNo ?? "",
        // Checkbox rows are rendered from these selections, not from prose.
        toolsCheckboxes: checkboxRow(
          FIR_INVESTIGATION_TOOLS,
          FIR_INVESTIGATION_TOOL_LABELS,
          tools.tools ?? []
        ),
        rootCauseClassificationCheckboxes: checkboxRow(
          FIR_ROOT_CAUSE_CLASSIFICATIONS,
          FIR_ROOT_CAUSE_CLASSIFICATION_LABELS,
          rootCause.classification ? [rootCause.classification] : []
        ),
        rootCauseGroupCheckboxes: checkboxRow(
          FIR_ROOT_CAUSE_GROUPS,
          FIR_ROOT_CAUSE_GROUP_LABELS,
          rootCause.groups ?? []
        ),
        humanErrorCheckboxes: checkboxRow(
          ["yes", "no"] as const,
          { yes: "Applicable", no: "Not Applicable" },
          humanError.applicable ? [humanError.applicable] : []
        ),
        resultsStatusCheckboxes: checkboxRow(
          FIR_RESULTS_STATUSES,
          FIR_RESULTS_STATUS_LABELS,
          impact.resultsStatus ? [impact.resultsStatus] : []
        ),
        batchDispositionCheckboxes: checkboxRow(
          FIR_BATCH_DISPOSITIONS,
          FIR_BATCH_DISPOSITION_LABELS,
          disposition.disposition ? [disposition.disposition] : []
        ),
        eventDescriptionXml: narrative("fir_event_description"),
        standardProceduresXml: narrative("fir_standard_procedures"),
        immediateActionXml: narrative("fir_immediate_action"),
        initialImpactXml: narrative("fir_initial_impact"),
        teamTableXml: field("fir_investigation_team", "table"),
        toolsNarrativeXml: field("fir_investigation_tools", "narrative"),
        chronologyNarrativeXml: field("fir_chronology", "narrative"),
        chronologyTableXml: field("fir_chronology", "table"),
        investigationDetailsXml: narrative("fir_investigation_details"),
        historicNarrativeXml: field("fir_historic_review", "narrative"),
        historicTableXml: field("fir_historic_review", "table"),
        rootCauseXml: field("fir_root_cause", "narrative"),
        humanErrorTableXml: field("fir_human_error", "table"),
        impactAssessmentXml: field("fir_impact_assessment", "narrative"),
        scopeAssessmentXml: narrative("fir_scope_assessment"),
        batchDispositionXml: field("fir_batch_disposition", "narrative"),
        correctionXml: narrative("fir_correction"),
        correctiveNarrativeXml: field("fir_corrective_action", "narrative"),
        correctiveTableXml: field("fir_corrective_action", "table"),
        interimNarrativeXml: field("fir_interim_control", "narrative"),
        interimTableXml: field("fir_interim_control", "table"),
        preventiveNarrativeXml: field("fir_preventive_action", "narrative"),
        preventiveTableXml: field("fir_preventive_action", "table"),
        effectivenessTableXml: field("fir_capa_effectiveness", "table"),
        attachmentsTableXml: field("fir_attachments", "table"),
      };
    },
  },
  defaultMetadata: { ...FIR_DEFAULT_METADATA },
};
