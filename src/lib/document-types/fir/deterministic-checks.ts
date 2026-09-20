import type { CriterionStatus } from "@/db/schema";
import type { EvaluationContext } from "@/lib/document-types/types";
import {
  FIR_BATCH_DISPOSITION_LABELS,
  FIR_BATCH_DISPOSITIONS,
  FIR_INVESTIGATION_TOOLS,
  FIR_ROOT_CAUSE_CLASSIFICATIONS,
  FIR_ROOT_CAUSE_GROUPS,
  type FirBatchDisposition,
  type FirInvestigationTool,
  type FirRootCauseClassification,
  type FirRootCauseGroup,
} from "./sections";
import {
  parseFirActionMatrix,
  parseFirEffectivenessMatrix,
  parseFirHistoricMatrix,
  parseFirHumanErrorMatrix,
  parseFirTeamMatrix,
} from "./matrix-parser";

function verdict(
  status: CriterionStatus,
  reasoning: string
): { status: CriterionStatus; reasoning: string } {
  return { status, reasoning };
}

/**
 * Concatenate the text nodes of a TipTap doc. Measuring the serialized JSON
 * instead would count structural noise, so an empty paragraph would read as
 * filled content.
 */
function plainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: unknown; content?: unknown };
  if (typeof n.text === "string") return n.text;
  if (!Array.isArray(n.content)) return "";
  return n.content.map(plainText).join(" ");
}

function narrativeText(content: unknown, field = "narrative"): string {
  const raw = (content as Record<string, unknown> | null | undefined)?.[field];
  return plainText(raw).replace(/\s+/g, " ").trim();
}

function field(content: unknown, key: string): string {
  const raw = (content as Record<string, unknown> | null | undefined)?.[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function stringArray(content: unknown, key: string): string[] {
  const raw = (content as Record<string, unknown> | null | undefined)?.[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

function listProblems(problems: readonly string[], positive: string) {
  if (problems.length === 0) return verdict("met", positive);
  return verdict("not_met", problems.join("; "));
}

// ------------------------------------------------------------------ narrative

export function checkNarrativePresent(ctx: EvaluationContext) {
  if (narrativeText(ctx.content).length < 20) {
    return verdict("not_met", "This section is still empty");
  }
  return verdict("met", "Narrative is present");
}

/**
 * R01 has an Initial Impact Assessment field that the DMAIC form has no home
 * for. ERF/26/022 omitted it entirely, so there is no record of what was
 * assessed at event time, before the full investigation ran.
 */
export function checkInitialImpactPresent(ctx: EvaluationContext) {
  const text = narrativeText(ctx.content);
  if (text.length < 20) {
    return verdict(
      "not_met",
      "Record the impact assessed at the time the event was raised, before the full investigation"
    );
  }
  return verdict("met", "Initial impact assessment is recorded");
}

// ------------------------------------------------------------ investigation

export function checkInvestigationTeam(ctx: EvaluationContext) {
  const parsed = parseFirTeamMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("not_met", "No investigation team members are listed");
  }
  const incomplete = parsed.rows.filter(
    (r) => !r.name.trim() || !r.department.trim()
  );
  if (incomplete.length > 0) {
    return verdict(
      "not_met",
      `${incomplete.length} team row(s) are missing a name or department`
    );
  }
  return verdict("met", `${parsed.rows.length} team member(s) listed`);
}

/**
 * R01 renders the tools as a fixed checkbox row. ERF/26/022 wrote free text
 * ("Documents review and Why-Why Analysis"), where "Documents review" is not
 * one of the seven listed tools.
 */
export function checkInvestigationTools(ctx: EvaluationContext) {
  const selected = stringArray(ctx.content, "tools");
  const known = new Set<string>(FIR_INVESTIGATION_TOOLS);
  const unknown = selected.filter((t) => !known.has(t));
  if (unknown.length > 0) {
    return verdict(
      "not_met",
      `Not a tool on the R01 form: ${unknown.join(", ")}. Record anything else under Other tools.`
    );
  }
  if (selected.length === 0) {
    return verdict(
      "not_met",
      "Select at least one investigation tool from the R01 list"
    );
  }
  return verdict(
    "met",
    `${selected.length} investigation tool(s) assigned` as string
  );
}

// ---------------------------------------------------------------- root cause

function selectedClassification(
  content: unknown
): FirRootCauseClassification | "" {
  const value = field(content, "classification");
  return (FIR_ROOT_CAUSE_CLASSIFICATIONS as readonly string[]).includes(value)
    ? (value as FirRootCauseClassification)
    : "";
}

function selectedGroups(content: unknown): FirRootCauseGroup[] {
  const known = new Set<string>(FIR_ROOT_CAUSE_GROUPS);
  return stringArray(content, "groups").filter((g): g is FirRootCauseGroup =>
    known.has(g)
  );
}

/**
 * R01 requires a classification and a 6M identification group. Both were absent
 * from ERF/26/022, whose prose said "probable root cause" in one place and
 * "the root cause" in another.
 */
export function checkRootCauseClassified(ctx: EvaluationContext) {
  const problems: string[] = [];
  const classification = selectedClassification(ctx.content);
  const groups = selectedGroups(ctx.content);

  if (!classification) {
    problems.push(
      "Set the Root Cause Classification (Assignable / Probable / Root Cause / No Root Cause)"
    );
  }
  if (groups.length === 0) {
    problems.push(
      "Set the Root Cause Identification Group (Man / Material / Machine / Method / Measurement / Milieu)"
    );
  }
  if (narrativeText(ctx.content).length < 40) {
    problems.push("Write the root cause description");
  }

  // "No Root Cause" has to agree across both fields or the form contradicts itself.
  const noneGroup = groups.includes("no_root_cause");
  if (classification === "no_root_cause" && groups.length > 0 && !noneGroup) {
    problems.push(
      "Classification is No Root Cause but an identification group is selected"
    );
  }
  if (noneGroup && groups.length > 1) {
    problems.push(
      "No Root Cause cannot be combined with another identification group"
    );
  }
  if (noneGroup && classification && classification !== "no_root_cause") {
    problems.push(
      `Identification group is No Root Cause but classification is ${FIR_ROOT_CAUSE_CLASSIFICATIONS.includes(classification) ? classification.replace(/_/g, " ") : classification}`
    );
  }

  return listProblems(
    problems,
    `Classified as ${classification.replace(/_/g, " ")} (${groups.join(", ")})`
  );
}

/**
 * The Human Error table is conditional on a Man root cause, but "conditional"
 * still means answered. A blank grid with no NA is indistinguishable from an
 * unfinished one.
 */
export function checkHumanErrorEvaluation(ctx: EvaluationContext) {
  const applicable = field(ctx.content, "applicable");
  const rootCause = ctx.dependencies?.fir_root_cause;
  const groups = selectedGroups(rootCause);
  const manCause = groups.includes("man");

  if (applicable !== "yes" && applicable !== "no") {
    return verdict(
      "not_met",
      "Record whether human error evaluation applies — leave it Not Applicable rather than blank"
    );
  }
  if (manCause && applicable === "no") {
    return verdict(
      "not_met",
      "Root cause group includes Man, so a human error evaluation is required"
    );
  }
  if (applicable === "no") {
    return verdict("met", "Marked not applicable");
  }

  const parsed = parseFirHumanErrorMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict(
      "not_met",
      "Human error evaluation is marked applicable but no rows are recorded"
    );
  }
  const incomplete = parsed.rows.filter(
    (r) => !r.employeeId.trim() || !r.error.trim() || !r.category.trim()
  );
  if (incomplete.length > 0) {
    return verdict(
      "not_met",
      `${incomplete.length} row(s) are missing an employee ID, error, or category`
    );
  }
  return verdict("met", `${parsed.rows.length} human error row(s) recorded`);
}

// ------------------------------------------------------------ historic review

/**
 * R01 prescribes the Historical Data Compilation columns. ERF/26/022 replaced
 * them with an ad-hoc layout that dropped Date, Event No and Batch No as
 * distinct fields, which is what makes a recurrence trend unreadable.
 */
export function checkHistoricReview(ctx: EvaluationContext) {
  const parsed = parseFirHistoricMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);

  const problems: string[] = [];
  if (parsed.missingColumns.length > 0) {
    problems.push(
      `The table is missing R01 columns: ${parsed.missingColumns.join(", ")}`
    );
  }
  if (parsed.rows.length === 0) {
    problems.push(
      "List prior events for this equipment/process, or state that none were found"
    );
  }
  const incomplete = parsed.rows.filter(
    (r) => !r.eventNo.trim() || !r.date.trim() || !r.rootCause.trim()
  );
  if (incomplete.length > 0) {
    problems.push(
      `${incomplete.length} row(s) are missing an event number, date, or root cause`
    );
  }
  if (parsed.rows.length > 0 && narrativeText(ctx.content).length < 40) {
    problems.push(
      "Write the inference drawn from the historical events above the table"
    );
  }
  return listProblems(
    problems,
    `${parsed.rows.length} historical event(s) compiled`
  );
}

const CAPA_EFFECTIVENESS_TERMS =
  /\beffective(ness|ly)?\b|\bineffective\b|\brecurr(ence|ing|ed|ent)\b|\brepeat(ed)? (event|deviation|failure)\b/i;

/**
 * When prior events share this event's root cause group, the report has to say
 * something about whether those CAPAs worked. ERF/26/022 did conclude the prior
 * CAPAs were "not fully effective" — and then closed as a routine single event.
 */
export function checkRecurrenceAddressed(ctx: EvaluationContext) {
  const parsed = parseFirHistoricMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("met", "No prior events to reconcile");
  }
  const text = narrativeText(ctx.content);
  if (!CAPA_EFFECTIVENESS_TERMS.test(text)) {
    return verdict(
      "not_met",
      `${parsed.rows.length} prior event(s) are listed — state whether their CAPAs were effective and whether this event is a recurrence`
    );
  }
  return verdict("met", "Prior CAPA effectiveness is addressed");
}

// ------------------------------------------------------------------- impact

const PENDING_RESULT_TERMS =
  /\bunder test(ing)?\b|\bpending\b|\bawait(ing|ed)\b|\byet to be (tested|received|reported)\b|\bin progress\b|\bnot yet (available|reported|received)\b/i;

/**
 * ERF/26/022 concluded "no adverse impact on product quality" while its own
 * table carried "Host Cell DNA — Under Testing", and the attachment restated
 * that same line as complete. Either the data is final or the conclusion is
 * interim; prose should not be able to blur the two.
 */
export function checkImpactAssessmentResultsStatus(ctx: EvaluationContext) {
  const text = narrativeText(ctx.content);
  const status = field(ctx.content, "resultsStatus");

  if (text.length < 40) {
    return verdict("not_met", "Impact assessment is still empty");
  }
  if (status !== "final" && status !== "interim") {
    return verdict(
      "not_met",
      "Record whether the analytical results supporting this assessment are final or interim"
    );
  }
  if (status === "final" && PENDING_RESULT_TERMS.test(text)) {
    const match = PENDING_RESULT_TERMS.exec(text)?.[0] ?? "pending";
    return verdict(
      "not_met",
      `Results are marked final but the assessment still refers to testing in progress ("${match}") — mark it interim or close it when testing completes`
    );
  }
  return verdict(
    "met",
    status === "final"
      ? "Assessment closes on final results"
      : "Assessment is explicitly interim"
  );
}

// -------------------------------------------------------------- disposition

/**
 * R01 has a Batch Disposition checkbox row. ERF/26/022 omitted it entirely, so
 * the package never records what happened to the batch it investigated.
 */
export function checkBatchDisposition(ctx: EvaluationContext) {
  const value = field(ctx.content, "disposition");
  const known = (FIR_BATCH_DISPOSITIONS as readonly string[]).includes(value);
  if (!known) {
    return verdict(
      "not_met",
      "Set the batch disposition (Approved / Rejected / Returned or Recalled / Not Applicable)"
    );
  }
  const disposition = value as FirBatchDisposition;
  const text = narrativeText(ctx.content);
  if (disposition !== "na" && text.length < 20) {
    return verdict(
      "not_met",
      `Disposition is "${FIR_BATCH_DISPOSITION_LABELS[disposition]}" — record the justification`
    );
  }
  return verdict(
    "met",
    `Batch disposition: ${FIR_BATCH_DISPOSITION_LABELS[disposition]}`
  );
}

// ------------------------------------------------------------------- actions

function actionRowProblems(rows: ReadonlyArray<Record<string, string>>) {
  const noOwner = rows.filter((r) => !r.responsibility?.trim()).length;
  const noDate = rows.filter((r) => !r.targetDate?.trim()).length;
  const problems: string[] = [];
  if (noOwner > 0) {
    problems.push(`${noOwner} action(s) have no responsibility assigned`);
  }
  if (noDate > 0) {
    problems.push(`${noDate} action(s) have no target completion date`);
  }
  return problems;
}

/**
 * An action with no owner and no date cannot be tracked to closure or
 * effectiveness-checked. ERF/26/022 shipped seven short-term actions and one
 * long-term action, none of which carried either.
 */
export function checkActionsOwnedAndDated(ctx: EvaluationContext) {
  const parsed = parseFirActionMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("not_met", "No actions are listed");
  }
  const problems = actionRowProblems(parsed.rows);
  const vague = parsed.rows.filter((r) =>
    /^\s*(soon|asap|as required|ongoing|continuous|tbd|na)\s*$/i.test(
      r.targetDate ?? ""
    )
  );
  if (vague.length > 0) {
    problems.push(
      `${vague.length} action(s) have a target date that is not a date`
    );
  }
  if (!parsed.rows.some((r) => r.actionPlan?.trim())) {
    problems.push("No action plan text is recorded");
  }
  return listProblems(
    problems,
    `${parsed.rows.length} action(s), each owned and dated`
  );
}

/**
 * Interim control is the gap between now and the permanent fix. It is optional
 * only when nothing is pending — if any corrective or preventive action has a
 * future target date, something has to cover the interval.
 */
export function checkInterimControl(ctx: EvaluationContext) {
  const parsed = parseFirActionMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);

  const pendingElsewhere = [
    ctx.dependencies?.fir_corrective_action,
    ctx.dependencies?.fir_preventive_action,
  ].some((dep) => {
    const other = parseFirActionMatrix(dep);
    return other.ok && other.rows.some((r) => r.targetDate?.trim());
  });

  if (parsed.rows.length === 0) {
    if (pendingElsewhere) {
      return verdict(
        "not_met",
        "Corrective or preventive actions are still open — record the interim control covering the interval, or state that none is required"
      );
    }
    return verdict("met", "No interim control required");
  }
  return listProblems(
    actionRowProblems(parsed.rows),
    `${parsed.rows.length} interim control(s), each owned and dated`
  );
}

/**
 * R01 requires a CAPA Effectiveness Check. It was absent from ERF/26/022, which
 * is the field that would otherwise have forced the recurrence question after
 * three prior vacuum events on the same equipment.
 */
export function checkCapaEffectiveness(ctx: EvaluationContext) {
  const parsed = parseFirEffectivenessMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);

  const hasActions = [
    ctx.dependencies?.fir_corrective_action,
    ctx.dependencies?.fir_preventive_action,
  ].some((dep) => {
    const other = parseFirActionMatrix(dep);
    return other.ok && other.rows.length > 0;
  });

  if (parsed.rows.length === 0) {
    if (!hasActions) {
      return verdict("met", "No CAPA to effectiveness-check");
    }
    return verdict(
      "not_met",
      "Corrective/preventive actions are recorded but no effectiveness check is defined"
    );
  }

  const problems: string[] = [];
  const noCriteria = parsed.rows.filter((r) => !r.criteria.trim()).length;
  const noDuration = parsed.rows.filter((r) => !r.duration.trim()).length;
  if (noCriteria > 0) {
    problems.push(`${noCriteria} check(s) have no acceptance criteria`);
  }
  if (noDuration > 0) {
    problems.push(`${noDuration} check(s) have no review duration`);
  }
  return listProblems(
    problems,
    `${parsed.rows.length} effectiveness check(s) defined`
  );
}

export type FirCheck = (ctx: EvaluationContext) => {
  status: CriterionStatus;
  reasoning: string;
};

export type { FirBatchDisposition, FirInvestigationTool };
