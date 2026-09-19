import type { CriterionStatus } from "@/db/schema";
import { textHasSourceCitation } from "@/lib/citations/cell-has-source";
import type { EvaluationContext } from "@/lib/document-types/types";
import { findDirectedContradictions } from "@/lib/eval/contradictions";
import { recordTypeReferenceMismatch } from "@/lib/eval/record-type";
import { collectQuantityMathSamples } from "@/lib/math/quantity-math";
import {
  hasReference,
  isDelayed,
  isDirectImpact,
  isNo,
  isOutOfTolerance,
  isPrivilegeGranted,
  isPrivilegeMark,
  isYes,
  parseAccessControlMatrix,
  parseAlarmMatrix,
  parseAuditTrailMatrix,
  parseBreakdownMatrix,
  parseCalibrationMatrix,
  parseCsvStatusMatrix,
  parseElrRevisionHistoryMatrix,
  parseMediaFillMatrix,
  parseMonitoringMatrix,
  parsePreventiveMaintenanceMatrix,
  parseQmsMatrix,
  parseQualificationMatrix,
  parseResponsibilitiesMatrix,
  parseRiskActionMatrix,
  parseSystemTrendsMatrix,
} from "./matrix-parser";
import { ACCESS_CONTROL_ROLE_IDS } from "./matrix-columns";
import { extractRawRows } from "@/lib/document-types/design-verification/matrix-parser";
import { tableFieldDoc } from "@/lib/document-types/qra/matrix-parser";
import { captionNumberAboveTable } from "@/lib/suggestions/table-operation";
import {
  ELR_CONCLUSION_RECAP_SOURCES,
  ELR_FORMAT_APPLICABILITY,
  ELR_RECAP_MIN_SUMMARY_CHARS,
  ELR_RISK_ACTION_MAX_ROWS,
  ELR_RISK_GRADES,
  ELR_TREND_RECAP_SOURCES,
  recapSourceMatchesText,
  type ElrRecommendation,
  type ElrRiskGrade,
  type ElrSectionRecapSource,
} from "./sections";
import {
  recommendationHasCalendarDate,
  recommendationHasFrequency,
  recommendationHasVagueTiming,
  recommendationMentionsDate,
} from "./recommendation-schedule";

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

/** Row label for diagnostics — serial number when present, else the position. */
function rowLabel(serial: string, index: number): string {
  const t = serial.trim();
  return t ? `row ${t}` : `row ${index + 1}`;
}

function listProblems(
  problems: readonly string[],
  okMessage: string,
  limit = 4
): { status: CriterionStatus; reasoning: string } {
  if (problems.length === 0) return verdict("met", okMessage);
  const shown = problems.slice(0, limit).join("; ");
  const more =
    problems.length > limit ? ` (+${problems.length - limit} more)` : "";
  return verdict("not_met", `${shown}${more}`);
}

/** This report's container format, from the title-page identity block. */
function reportFormat(ctx: EvaluationContext): string {
  const meta = ctx.report?.metadata;
  if (!meta || typeof meta !== "object") return "";
  const scope = (meta as { formatScope?: unknown }).formatScope;
  return typeof scope === "string" ? scope.trim() : "";
}

function isLineCommon(cell: string): boolean {
  return /line[- ]?common|common|both|all/i.test(cell.trim());
}

/**
 * A record belongs in this ELR when it is line-common or carries this report's
 * format. Flags rows written for the counterpart format, which is the failure
 * mode when vial and cartridge ELRs are compiled from one document pile.
 */
function formatMismatch(cell: string, format: string): boolean {
  const value = cell.trim();
  if (!value || !format) return false;
  if (isLineCommon(value)) return false;
  return value.toLowerCase() !== format.toLowerCase();
}

export function checkNarrativePresent(ctx: EvaluationContext) {
  if (narrativeText(ctx.content).trim().length < 20) {
    return verdict("not_met", "This section is still empty");
  }
  return verdict("met", "Narrative is present");
}

/**
 * Limits/counts in math atoms (`$<1 CFU/plate$`) become OMML that Word
 * refuses when `m:t` contains a raw `<`. Flatten them to Unicode prose.
 */
export function checkQuantityMathAsProse(ctx: EvaluationContext) {
  const samples = collectQuantityMathSamples(ctx.content);
  if (samples.length === 0) {
    return verdict("met", "Limits and counts are written as ordinary text");
  }
  const shown = samples
    .slice(0, 4)
    .map((latex) => `$${latex}$`)
    .join("; ");
  const more =
    samples.length > 4 ? ` (+${samples.length - 4} more)` : "";
  return verdict(
    "not_met",
    `Limits/counts sit in math atoms that can break Word export: ${shown}${more}`
  );
}

export function checkResponsibilitiesTable(ctx: EvaluationContext) {
  const parsed = parseResponsibilitiesMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("not_met", "No responsibilities are listed");
  }
  const problems: string[] = [];
  if (captionNumberAboveTable(tableFieldDoc(ctx.content, "table"), 0) === null) {
    problems.push(
      "The table is missing a Table N. caption immediately above it"
    );
  }
  if (narrativeText(ctx.content).length < 20) {
    problems.push(
      "Write a short summary of departmental responsibilities above the table and refer to Table N"
    );
  }
  if (problems.length > 0) {
    return listProblems(
      problems,
      `${parsed.rows.length} department(s) listed`
    );
  }
  const incomplete = parsed.rows.filter(
    (r) => !r.department.trim() || !r.responsibility.trim()
  );
  if (incomplete.length > 0) {
    return verdict(
      "partially_met",
      `${incomplete.length} row(s) are missing a department or responsibility`
    );
  }
  return verdict("met", `${parsed.rows.length} department(s) listed`);
}

export function checkQualificationChain(ctx: EvaluationContext) {
  const parsed = parseQualificationMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict(
      "not_met",
      "No qualification history recorded — this section is cumulative for the life of the equipment"
    );
  }
  const problems: string[] = [];
  parsed.rows.forEach((row, index) => {
    const label = rowLabel(row.serial, index);
    if (!row.stage.trim()) problems.push(`${label} has no qualification stage`);
    if (!hasReference(row.documentNo)) {
      problems.push(`${label} has no protocol / report number`);
    }
    if (!row.outcome.trim()) problems.push(`${label} has no outcome`);
  });
  return listProblems(
    problems,
    `${parsed.rows.length} qualification stage(s) recorded`
  );
}

export function checkQualificationFormatScope(ctx: EvaluationContext) {
  const format = reportFormat(ctx);
  if (!format) {
    return verdict(
      "not_met",
      "Set the container format on the title page — a separate ELR is compiled per format"
    );
  }
  const parsed = parseQualificationMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("not_met", "No qualification rows to scope");
  }
  const unmarked: string[] = [];
  const wrongFormat: string[] = [];
  parsed.rows.forEach((row, index) => {
    const label = rowLabel(row.serial, index);
    const value = row.formatApplicability.trim();
    if (!value) {
      unmarked.push(label);
      return;
    }
    if (formatMismatch(value, format)) wrongFormat.push(`${label} (${value})`);
  });
  if (wrongFormat.length > 0) {
    return listProblems(
      wrongFormat.map(
        (l) => `${l} belongs to another format; mark it Line-common or remove it`
      ),
      ""
    );
  }
  if (unmarked.length > 0) {
    return verdict(
      "partially_met",
      `${unmarked.length} row(s) have no format applicability — mark each ${ELR_FORMAT_APPLICABILITY.join(", ")}`
    );
  }
  return verdict("met", `Every row is scoped to ${format} or Line-common`);
}

/** Identity-block dates are `<input type="date">` values, so ISO and sortable. */
function isoDate(value: unknown): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? value.trim()
    : "";
}

function metadataField(ctx: EvaluationContext, key: string): string {
  const meta = ctx.report?.metadata;
  if (!meta || typeof meta !== "object") return "";
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * SOP/DP/QA/014 §7.17.17: the periodic re-qualification report approval date is
 * the done date, and the next due date runs from the original schedule. So a
 * next-PRQ date falling on or before this ELR's cut-off means either the PRQ is
 * overdue or the identity block was never updated after it was executed — both
 * are findings, and both are invisible if nobody compares the two dates.
 */
export function checkPrqScheduleCurrent(ctx: EvaluationContext) {
  const nextPrq = isoDate(metadataField(ctx, "nextPrqDate"));
  const periodTo = isoDate(metadataField(ctx, "periodTo"));
  if (!nextPrq) {
    return verdict(
      "not_met",
      "Record the next periodic re-qualification due date on the title page"
    );
  }
  if (!periodTo) {
    return verdict("not_met", "Record the ELR period end date on the title page");
  }
  if (nextPrq <= periodTo) {
    return verdict(
      "not_met",
      `Next PRQ is due ${nextPrq}, on or before the ELR cut-off ${periodTo} — either the PRQ is overdue, or it was executed and the title page still shows the superseded due date`
    );
  }
  return verdict("met", `Next PRQ (${nextPrq}) falls after the ELR period`);
}

export function checkMediaFillTable(ctx: EvaluationContext) {
  const parsed = parseMediaFillMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict(
      "not_met",
      "No media fill recorded — aseptic process simulation is the primary ongoing verification for a filling machine"
    );
  }
  const problems: string[] = [];
  parsed.rows.forEach((row, index) => {
    const label = rowLabel(row.serial, index);
    if (!row.result.trim()) problems.push(`${label} has no result`);
    if (!row.contaminatedUnits.trim()) {
      problems.push(`${label} does not record contaminated units`);
    }
    if (isOutOfTolerance(row.result) && !hasReference(row.deviationRef)) {
      problems.push(`${label} failed but has no linked deviation`);
    }
    const sourcedCells: Array<[string, string]> = [
      ["media fill number", row.mediaFillNo],
      ["date", row.date],
      ["units filled", row.unitsFilled],
      ["contaminated units", row.contaminatedUnits],
    ];
    for (const [cellLabel, value] of sourcedCells) {
      if (!value.trim()) continue;
      if (!textHasSourceCitation(value)) {
        problems.push(
          `${label} ${cellLabel} has no source citation ([filename] or [n])`
        );
      }
    }
  });
  return listProblems(problems, `${parsed.rows.length} media fill(s) recorded`);
}

export function checkMonitoringExcursionsLinked(ctx: EvaluationContext) {
  const parsed = parseMonitoringMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("not_met", "No monitoring data recorded for the ELR period");
  }
  const problems: string[] = [];
  parsed.rows.forEach((row, index) => {
    const label = rowLabel(row.serial, index);
    if (!row.excursion.trim()) {
      problems.push(`${label} does not say whether there was an excursion`);
      return;
    }
    if (isYes(row.excursion) && !hasReference(row.deviationRef)) {
      problems.push(`${label} reports an excursion with no linked deviation`);
    }
  });
  return listProblems(
    problems,
    `${parsed.rows.length} monitoring row(s); every excursion is linked to a deviation`
  );
}

export function checkCalibrationStatus(ctx: EvaluationContext) {
  const parsed = parseCalibrationMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("not_met", "No instrument calibration status recorded");
  }
  const problems: string[] = [];
  parsed.rows.forEach((row, index) => {
    const label = rowLabel(row.serial, index);
    if (!hasReference(row.instrumentId)) {
      problems.push(`${label} has no instrument ID`);
    }
    if (!row.result.trim()) {
      problems.push(`${label} has no calibration result`);
      return;
    }
    if (isOutOfTolerance(row.result) && !hasReference(row.deviationRef)) {
      problems.push(
        `${label} is out of tolerance with no linked deviation / CAPA`
      );
    }
  });
  return listProblems(
    problems,
    `${parsed.rows.length} instrument(s); every out-of-tolerance result is linked`
  );
}

export function checkPreventiveMaintenanceJustified(ctx: EvaluationContext) {
  const parsed = parsePreventiveMaintenanceMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("not_met", "No preventive maintenance recorded");
  }
  const problems: string[] = [];
  parsed.rows.forEach((row, index) => {
    const label = rowLabel(row.serial, index);
    if (!row.status.trim()) {
      problems.push(`${label} has no on-time / delayed status`);
      return;
    }
    if (isDelayed(row.status) && !row.remarks.trim()) {
      problems.push(`${label} is delayed and needs a justification in Remarks`);
    }
  });
  return listProblems(
    problems,
    `${parsed.rows.length} PM activity(ies); every delay is justified`
  );
}

export function checkBreakdownRepeatCapa(ctx: EvaluationContext) {
  const parsed = parseBreakdownMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("met", "No breakdowns recorded in the ELR period");
  }
  const problems: string[] = [];
  parsed.rows.forEach((row, index) => {
    const label = rowLabel(row.serial, index);
    if (!row.failureDescription.trim()) {
      problems.push(`${label} has no failure description`);
    }
    if (!row.repeat.trim()) {
      problems.push(`${label} does not say whether the failure mode repeated`);
      return;
    }
    if (isYes(row.repeat) && !hasReference(row.capaRef)) {
      problems.push(`${label} is a repeat failure with no linked CAPA`);
    }
  });
  return listProblems(
    problems,
    `${parsed.rows.length} breakdown(s); every repeat failure mode has a CAPA`
  );
}

export function checkQmsRecords(ctx: EvaluationContext) {
  const parsed = parseQmsMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict(
      "not_met",
      "No QMS records listed for the period since the last PRQ"
    );
  }
  const format = reportFormat(ctx);
  const problems: string[] = [];
  parsed.rows.forEach((row, index) => {
    const label = rowLabel(row.serial, index);
    if (!row.type.trim()) problems.push(`${label} has no record type`);
    if (!hasReference(row.documentRef)) {
      problems.push(`${label} has no document reference`);
    }
    if (!row.status.trim()) problems.push(`${label} has no status`);
    if (!row.qualificationImpact.trim()) {
      problems.push(`${label} does not answer qualification impact`);
    }
    if (formatMismatch(row.formatApplicability, format)) {
      problems.push(
        `${label} is scoped to ${row.formatApplicability.trim()}, not this ELR's format`
      );
    }
  });
  return listProblems(problems, `${parsed.rows.length} QMS record(s) listed`);
}

/**
 * A typed QMS row must cite a document number of the same class
 * (CAPA → CAPA-…, deviation → DEV-…, not a CAPA row citing DEV-).
 */
export function checkRecordTypeMatchesReference(ctx: EvaluationContext) {
  const parsed = parseQmsMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("met", "No QMS rows to bind");
  }
  const problems: string[] = [];
  parsed.rows.forEach((row, index) => {
    const mismatch = recordTypeReferenceMismatch(row.type, row.documentRef);
    if (!mismatch) return;
    problems.push(
      `${rowLabel(row.serial, index)} is typed ${mismatch.typeClass} but cites a ${mismatch.refClass} number (${row.documentRef.trim()})`
    );
  });
  return listProblems(
    problems,
    "Each typed QMS row cites a matching document number"
  );
}

/**
 * A QMS record marked as affecting the qualified state has to show up in the
 * qualification history — an executed change control with no follow-up
 * qualification activity is the gap this report exists to catch.
 */
export function checkQmsQualificationFollowUp(ctx: EvaluationContext) {
  const qms = parseQmsMatrix(ctx.content);
  if (!qms.ok) return verdict("not_met", qms.reason);
  const impacting = qms.rows.filter(
    (row) => isYes(row.qualificationImpact) && hasReference(row.documentRef)
  );
  if (impacting.length === 0) {
    return verdict("met", "No QMS record is marked as affecting the qualified state");
  }
  const qualification = parseQualificationMatrix(
    ctx.dependencies.elr_qualification ?? {}
  );
  if (!qualification.ok) {
    return verdict("not_met", "Qualification history could not be read");
  }
  const haystack = qualification.rows
    .map((row) => Object.values(row).join(" "))
    .join(" ")
    .toLowerCase();
  const orphaned = impacting
    .filter((row) => !haystack.includes(row.documentRef.trim().toLowerCase()))
    .map(
      (row) =>
        `${row.documentRef.trim()} affects the qualified state but is not referenced in the qualification history`
    );
  return listProblems(
    orphaned,
    `${impacting.length} qualification-impacting record(s) are traced to a qualification activity`
  );
}

export function checkAlarmDirectImpactAction(ctx: EvaluationContext) {
  const parsed = parseAlarmMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("not_met", "No alarms recorded for the ELR period");
  }
  const problems: string[] = [];
  parsed.rows.forEach((row, index) => {
    const label = rowLabel(row.serial, index);
    if (!row.criticality.trim()) {
      problems.push(`${label} is not categorised Direct or Indirect Impact`);
      return;
    }
    if (!isDirectImpact(row.criticality)) return;
    if (!hasReference(row.remediation) && !hasReference(row.deviationRef)) {
      problems.push(
        `${label} is a Direct Impact alarm with no remediation reference or deviation`
      );
    }
  });
  return listProblems(
    problems,
    `${parsed.rows.length} alarm(s); every Direct Impact alarm has an action reference`
  );
}

export function checkAccessControlRows(ctx: EvaluationContext) {
  const parsed = parseAccessControlMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict(
      "partially_met",
      "No privilege matrix copied — copy the SOP / CSV task×role annexure or mark the section Not Applicable"
    );
  }
  const problems: string[] = [];
  parsed.rows.forEach((row, index) => {
    const label = rowLabel(row.serial, index);
    if (!row.systemName.trim()) problems.push(`${label} has no system name`);
    if (!row.task.trim()) problems.push(`${label} has no task`);
  });
  return listProblems(problems, `${parsed.rows.length} access record(s)`);
}

/**
 * Access-control assessment must cover the period: last review date,
 * recertification of Level 4 / admin holders, and 21 CFR Part 11.
 */
export function checkAccessControlPeriodCompleteness(ctx: EvaluationContext) {
  const parsed = parseAccessControlMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("met", "No access-control rows requiring a period statement");
  }
  const text = narrativeText(ctx.content);
  const problems: string[] = [];
  if (
    !/last (?:review|verification|recertif)|reviewed on|review date|last performed|period(?:ic)? verification/i.test(
      text
    )
  ) {
    problems.push(
      "The assessment does not state when access control was last reviewed this period"
    );
  }
  const adminHolders = parsed.rows.some((row) =>
    isPrivilegeGranted(row.administrator)
  );
  if (adminHolders && !/recertif/i.test(text)) {
    problems.push(
      "Level 4 / admin holders require a recertification statement"
    );
  }
  if (!/21\s*c\.?f\.?r\.?|part\s*11/i.test(text)) {
    problems.push(
      "The assessment does not confirm 21 CFR Part 11 access, audit-trail and authority checks remain in force"
    );
  }
  return listProblems(
    problems,
    "Access-control period completeness is stated"
  );
}

const CALIBRATION_CONTRADICTION_RULES = [
  {
    when: /\boot\b|out of tolerance|expired|overdue/i,
    contradicts:
      /within calibration|in tolerance|\bvalid\b|all instruments remain/i,
    message:
      "The table has an out-of-tolerance or overdue result but the assessment says instruments remain within calibration",
  },
] as const;

const REPEAT_ISOLATED_RULES = [
  {
    when: /\by\b|\byes\b|repeat/i,
    contradicts:
      /\bisolated\b|one-off|first occurrence|first time|single event/i,
    message:
      "A repeat failure is recorded but the assessment treats it as isolated / one-off",
  },
] as const;

const ACCESS_CONTROL_ROLE_LABELS: Record<
  (typeof ACCESS_CONTROL_ROLE_IDS)[number],
  string
> = {
  operator: "Operator",
  supervisor: "Supervisor",
  maintenance: "Maintenance",
  administrator: "Administrator",
};

export function checkCalibrationValidityNotContradicted(
  ctx: EvaluationContext
) {
  const parsed = parseCalibrationMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("met", "No calibration rows");
  }
  const source = parsed.rows
    .map((row) => `${row.result} ${row.dueDate} ${row.doneDate}`)
    .join("\n");
  return listProblems(
    findDirectedContradictions(
      source,
      narrativeText(ctx.content),
      CALIBRATION_CONTRADICTION_RULES
    ),
    "Calibration assessment does not contradict table results"
  );
}

export function checkBreakdownRepeatNotIsolated(ctx: EvaluationContext) {
  const parsed = parseBreakdownMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  const repeats = parsed.rows.filter((row) => isYes(row.repeat));
  if (repeats.length === 0) {
    return verdict("met", "No repeat failures to contradict");
  }
  const source = repeats.map((row) => `repeat ${row.repeat}`).join("\n");
  return listProblems(
    findDirectedContradictions(
      source,
      narrativeText(ctx.content),
      REPEAT_ISOLATED_RULES
    ),
    "Repeat failures are not described as isolated"
  );
}

export function checkAccessControlRoleMarks(ctx: EvaluationContext) {
  const parsed = parseAccessControlMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("met", "No privilege-matrix rows to mark");
  }
  const problems: string[] = [];
  parsed.rows.forEach((row, index) => {
    const label = rowLabel(row.serial, index);
    for (const roleId of ACCESS_CONTROL_ROLE_IDS) {
      if (isPrivilegeMark(row[roleId])) continue;
      problems.push(
        `${label} ${ACCESS_CONTROL_ROLE_LABELS[roleId]} is not a ✓ / × (or Y/N) privilege mark`
      );
    }
  });
  return listProblems(
    problems,
    `${parsed.rows.length} task(s) carry Operator / Supervisor / Maintenance / Administrator marks`
  );
}

export function checkAuditTrailReviewed(ctx: EvaluationContext) {
  const parsed = parseAuditTrailMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict(
      "not_met",
      "No audit trail review recorded — a lapsed review period is a finding"
    );
  }
  const problems: string[] = [];
  parsed.rows.forEach((row, index) => {
    const label = rowLabel(row.serial, index);
    if (!row.reviewPeriod.trim()) {
      problems.push(`${label} has no review period`);
    }
    if (!row.anomalyFound.trim()) {
      problems.push(`${label} does not say whether an anomaly was found`);
      return;
    }
    if (isYes(row.anomalyFound) && !row.remarks.trim()) {
      problems.push(`${label} found an anomaly but records no deviation`);
    }
  });
  return listProblems(
    problems,
    `${parsed.rows.length} audit trail review(s) recorded`
  );
}

export function checkCsvStatus(ctx: EvaluationContext) {
  const parsed = parseCsvStatusMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict(
      "not_met",
      "No computerized system status recorded — state Not Applicable explicitly if the equipment has none"
    );
  }
  const problems: string[] = [];
  parsed.rows.forEach((row, index) => {
    const label = rowLabel(row.serial, index);
    if (!row.validationStatus.trim()) {
      problems.push(`${label} has no validation status`);
    }
    if (!row.revalidationDueDate.trim()) {
      problems.push(`${label} has no revalidation due date`);
    }
    if (!row.changeSinceLastPrq.trim()) {
      problems.push(`${label} does not answer whether it changed since last PRQ`);
      return;
    }
    if (
      isYes(row.changeSinceLastPrq) &&
      !hasReference(row.changeControlRef)
    ) {
      problems.push(`${label} changed since last PRQ with no change control`);
    }
  });
  return listProblems(
    problems,
    `${parsed.rows.length} computerized system(s) recorded`
  );
}

export function checkRecommendationSelected(ctx: EvaluationContext) {
  const content = ctx.content as
    | { recommendation?: ElrRecommendation }
    | null
    | undefined;
  const recommendation = (content?.recommendation ?? "").trim();
  if (!recommendation) {
    return verdict("not_met", "No recommendation selected");
  }
  if (narrativeText(ctx.content).trim().length < 20) {
    return verdict("partially_met", "Recommendation selected but the conclusion is empty");
  }
  if (
    recommendation === "other" &&
    narrativeText(ctx.content, "recommendationNarrative").trim().length < 10
  ) {
    return verdict(
      "partially_met",
      "Recommendation is Other — specify it in the justification"
    );
  }
  return verdict("met", `Recommendation recorded (${recommendation})`);
}

/**
 * §6.0 must name calendar dates (next PRQ, 5.2 target dates) and how often
 * each follow-up runs. "Soon" / "as required" / "periodically" is not a schedule.
 */
export function checkRecommendationNamesSchedule(ctx: EvaluationContext) {
  const text = narrativeText(ctx.content, "recommendationNarrative");
  if (text.length < 20) {
    return verdict(
      "not_met",
      "Recommendation 6.0 is empty — name calendar dates and how often each follow-up runs"
    );
  }
  const hasDate = recommendationHasCalendarDate(text);
  const hasFrequency = recommendationHasFrequency(text);
  const problems: string[] = [];
  if (!hasDate) {
    problems.push(
      "6.0 names no calendar date (next PRQ, action target, or revalidation due)"
    );
  }
  if (!hasFrequency) {
    problems.push(
      "6.0 names no frequency (annual PRQ, quarterly PM, monthly effectiveness check)"
    );
  }
  const nextPrq = isoDate(metadataField(ctx, "nextPrqDate"));
  if (nextPrq && !recommendationMentionsDate(text, nextPrq)) {
    problems.push(`Next PRQ due ${nextPrq} is not named in 6.0`);
  }
  const actions = parseRiskActionMatrix(ctx.dependencies?.elr_risk_actions);
  if (actions.ok) {
    for (const row of actions.rows) {
      const due = row.targetDate.trim();
      if (!due) continue;
      if (!recommendationHasCalendarDate(due) && !isoDate(due)) continue;
      if (!recommendationMentionsDate(text, due)) {
        problems.push(`5.2 target date ${due} is not named in 6.0`);
      }
    }
  }
  if (problems.length === 0) {
    return verdict("met", "6.0 names calendar dates and follow-up frequency");
  }
  const vague = recommendationHasVagueTiming(text)
    ? " Vague timing (soon / as required / periodically) is not a schedule."
    : "";
  return verdict(
    !hasDate && !hasFrequency ? "not_met" : "partially_met",
    `${problems.join("; ")}.${vague}`
  );
}

export function checkElrRevisionHistory(ctx: EvaluationContext) {
  const parsed = parseElrRevisionHistoryMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("not_met", "Revision history has no rows");
  }
  const incomplete = parsed.rows.filter(
    (r) => !r.revision.trim() || !r.change.trim()
  );
  if (incomplete.length > 0) {
    return verdict(
      "partially_met",
      `${incomplete.length} revision-history row(s) are missing a revision or change`
    );
  }
  return verdict("met", `${parsed.rows.length} revision(s) recorded`);
}

function countFilledTableRows(content: unknown, field = "table"): number {
  const raw = extractRawRows(tableFieldDoc(content, field));
  if ("error" in raw) return 0;
  return raw.dataRows.filter((cells) => cells.some((c) => c.trim())).length;
}

const QUALIFIED_STATE_RE =
  /qualified state|remain(?:s)? qualified|still qualified|not in (?:its )?qualified|requalif/i;

function filledCellText(content: unknown, field = "table"): string {
  const raw = extractRawRows(tableFieldDoc(content, field));
  if ("error" in raw) return "";
  return raw.dataRows.flat().join(" ");
}

function parseHours(cell: string): number {
  const match = cell.replace(/,/g, "").match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : 0;
}

function totalBreakdownDowntime(content: unknown): number {
  const parsed = parseBreakdownMatrix(content);
  if (!parsed.ok) return 0;
  return parsed.rows.reduce((sum, row) => sum + parseHours(row.downtime), 0);
}

function contentMentionsScrap(content: unknown): boolean {
  return /scrap|discard/i.test(filledCellText(content));
}

function sectionHasFlaggedFindings(ctx: EvaluationContext): boolean {
  if (ctx.section === "elr_monitoring") {
    const parsed = parseMonitoringMatrix(ctx.content);
    return parsed.ok && parsed.rows.some((row) => isYes(row.excursion));
  }
  if (ctx.section === "elr_calibration") {
    const parsed = parseCalibrationMatrix(ctx.content);
    return parsed.ok && parsed.rows.some((row) => isOutOfTolerance(row.result));
  }
  if (ctx.section === "elr_breakdowns") {
    const parsed = parseBreakdownMatrix(ctx.content);
    return parsed.ok && parsed.rows.some((row) => isYes(row.repeat));
  }
  if (ctx.section === "elr_alarms") {
    const parsed = parseAlarmMatrix(ctx.content);
    return parsed.ok && parsed.rows.some((row) => isDirectImpact(row.criticality));
  }
  if (ctx.section === "elr_preventive_maintenance") {
    const parsed = parsePreventiveMaintenanceMatrix(ctx.content);
    return parsed.ok && parsed.rows.some((row) => isDelayed(row.status));
  }
  if (ctx.section === "elr_qms") {
    const parsed = parseQmsMatrix(ctx.content);
    return parsed.ok && parsed.rows.some((row) => isYes(row.qualificationImpact));
  }
  return false;
}

/**
 * Floor for the assessment above an evidence table: if there are events, the
 * narrative has to interpret them (a count, not a "section was reviewed" recap).
 * Empty tables do not require an assessment.
 */
export function checkAssessmentInterpretsTable(ctx: EvaluationContext) {
  const rows = countFilledTableRows(ctx.content);
  if (rows === 0) {
    return verdict("met", "No table rows to interpret");
  }
  const missingCaption =
    captionNumberAboveTable(tableFieldDoc(ctx.content, "table"), 0) === null;
  const text = narrativeText(ctx.content);
  if (text.length < 40) {
    const captionNote = missingCaption
      ? " The table is also missing a Table N. caption immediately above it."
      : "";
    return verdict(
      "not_met",
      `The table has ${rows} row(s) but the assessment is empty or a one-liner — interpret the counts, implication, and any product or runtime impact.${captionNote}`
    );
  }
  if (!/\d/.test(text)) {
    return verdict(
      "not_met",
      "The assessment does not state a count from the table"
    );
  }
  const gaps: string[] = [];
  if (missingCaption) {
    gaps.push(
      "The filled table is missing a Table N. caption immediately above it"
    );
  }
  const downtime = totalBreakdownDowntime(ctx.content);
  if (
    downtime > 0 &&
    !/downtime|hours|runtime|availability/i.test(text)
  ) {
    gaps.push(
      `The table records ${downtime} downtime hour(s) but the assessment does not mention downtime, hours, runtime or availability`
    );
  }
  const cells = filledCellText(ctx.content);
  if (/scrap|discard/i.test(cells) && !/scrap/i.test(text)) {
    gaps.push("The table mentions scrap or discard but the assessment does not");
  }
  if (/\bcapa[-/]/i.test(cells) && !/\bcapa\b/i.test(text)) {
    gaps.push(
      "The table cites a CAPA number but the assessment does not mention CAPA"
    );
  }
  if (ctx.section === "elr_csv_status") {
    const csv = parseCsvStatusMatrix(ctx.content);
    if (
      csv.ok &&
      csv.rows.some((row) => row.revalidationDueDate.trim()) &&
      !/\bdue\b|\boverdue\b|next (?:re)?validat/i.test(text)
    ) {
      gaps.push(
        "The table records a revalidation due date but the assessment does not name it as due, overdue, or next revalidation"
      );
    }
  }
  if (sectionHasFlaggedFindings(ctx) && !QUALIFIED_STATE_RE.test(text)) {
    gaps.push(
      "Flagged findings are present — the assessment must state whether the equipment remains in its qualified state"
    );
  }
  if (gaps.length > 0) {
    return listProblems(gaps, "Assessment interprets the table");
  }
  return verdict("met", "Assessment is present and includes a count");
}

type FlaggedFinding = {
  section: string;
  message: string;
  needle: RegExp;
};

function flaggedFindingGroups(
  dependencies: Record<string, unknown>
): FlaggedFinding[] {
  const flags: FlaggedFinding[] = [];

  const breakdowns = parseBreakdownMatrix(dependencies.elr_breakdowns ?? {});
  if (breakdowns.ok) {
    const n = breakdowns.rows.filter((r) => isYes(r.repeat)).length;
    if (n > 0) {
      flags.push({
        section: "elr_breakdowns",
        message: `${n} repeat breakdown(s)`,
        needle: /\brepeat/i,
      });
    }
  }

  const alarms = parseAlarmMatrix(dependencies.elr_alarms ?? {});
  if (alarms.ok) {
    const n = alarms.rows.filter((r) => isDirectImpact(r.criticality)).length;
    if (n > 0) {
      flags.push({
        section: "elr_alarms",
        message: `${n} Direct Impact alarm(s)`,
        needle: /direct\s*impact|\bdi\b/i,
      });
    }
  }

  const monitoring = parseMonitoringMatrix(dependencies.elr_monitoring ?? {});
  if (monitoring.ok) {
    const n = monitoring.rows.filter((r) => isYes(r.excursion)).length;
    if (n > 0) {
      flags.push({
        section: "elr_monitoring",
        message: `${n} monitoring excursion(s)`,
        needle: /excursion/i,
      });
    }
  }

  const calibration = parseCalibrationMatrix(dependencies.elr_calibration ?? {});
  if (calibration.ok) {
    const n = calibration.rows.filter((r) => isOutOfTolerance(r.result)).length;
    if (n > 0) {
      flags.push({
        section: "elr_calibration",
        message: `${n} out-of-tolerance calibration(s)`,
        needle: /out[- ]of[- ]tolerance|\boot\b/i,
      });
    }
  }

  const pm = parsePreventiveMaintenanceMatrix(
    dependencies.elr_preventive_maintenance ?? {}
  );
  if (pm.ok) {
    const n = pm.rows.filter((r) => isDelayed(r.status)).length;
    if (n > 0) {
      flags.push({
        section: "elr_preventive_maintenance",
        message: `${n} delayed PM(s)`,
        needle: /delay/i,
      });
    }
  }

  const qms = parseQmsMatrix(dependencies.elr_qms ?? {});
  if (qms.ok) {
    const n = qms.rows.filter((r) => isYes(r.qualificationImpact)).length;
    if (n > 0) {
      flags.push({
        section: "elr_qms",
        message: `${n} qualification-impacting QMS record(s)`,
        needle: /qualification[- ]impact/i,
      });
    }
  }

  return flags;
}

function flaggedFindings(dependencies: Record<string, unknown>): string[] {
  return flaggedFindingGroups(dependencies).map((flag) => flag.message);
}

function recapRowForSource(
  rows: readonly { section: string; summary: string }[],
  source: ElrSectionRecapSource
) {
  return rows.find((row) => recapSourceMatchesText(source, row.section));
}

export function checkSystemTrendRows(ctx: EvaluationContext) {
  const parsed = parseSystemTrendsMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  const problems: string[] = [];
  for (const source of ELR_TREND_RECAP_SOURCES) {
    const row = recapRowForSource(parsed.rows, source);
    if (!row) {
      problems.push(`${source.number} ${source.label} has no recap row`);
      continue;
    }
    if (row.summary.trim().length < ELR_RECAP_MIN_SUMMARY_CHARS) {
      problems.push(
        `${source.number} ${source.label} has no summary of what that section found`
      );
    }
  }
  return listProblems(
    problems,
    `${ELR_TREND_RECAP_SOURCES.length} section recap(s) recorded`
  );
}

export function checkSystemTrendsCoverFlaggedFindings(ctx: EvaluationContext) {
  const flags = flaggedFindingGroups(ctx.dependencies);
  if (flags.length === 0) {
    return verdict("met", "No flagged findings that require a system-trend row");
  }
  const parsed = parseSystemTrendsMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  const problems: string[] = [];
  for (const flag of flags) {
    const source = ELR_TREND_RECAP_SOURCES.find((s) => s.key === flag.section);
    if (!source) continue;
    const row = recapRowForSource(parsed.rows, source);
    if (!row) {
      problems.push(`${flag.message} — ${source.number} has no recap row`);
      continue;
    }
    if (!flag.needle.test(row.summary)) {
      problems.push(
        `${flag.message} not named in the ${source.number} summary`
      );
    }
  }
  return listProblems(
    problems,
    `${flags.length} flagged finding group(s) named in the matching recap`
  );
}

function listItemTexts(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  const n = node as { type?: unknown; content?: unknown };
  if (n.type === "listItem") {
    const text = plainText(node).replace(/\s+/g, " ").trim();
    return text ? [text] : [];
  }
  if (!Array.isArray(n.content)) return [];
  return n.content.flatMap(listItemTexts);
}

export function checkConclusionRecapsSections(ctx: EvaluationContext) {
  const raw = (ctx.content as Record<string, unknown> | null | undefined)
    ?.narrative;
  const items = listItemTexts(raw);
  if (items.length === 0) {
    return verdict(
      "not_met",
      "Conclusion has no bulleted recap of previous sections"
    );
  }
  const problems: string[] = [];
  for (const source of ELR_CONCLUSION_RECAP_SOURCES) {
    const item = items.find((text) => recapSourceMatchesText(source, text));
    if (!item) {
      problems.push(`${source.number} ${source.label} has no recap bullet`);
      continue;
    }
    if (item.length < ELR_RECAP_MIN_SUMMARY_CHARS + 8) {
      problems.push(
        `${source.number} ${source.label} bullet names the section without summarising it`
      );
    }
  }
  return listProblems(
    problems,
    `${ELR_CONCLUSION_RECAP_SOURCES.length} previous section(s) recapped`
  );
}

function isPriorityCell(cell: string): boolean {
  return /^(high|medium|low|h|m|l)\b/i.test(cell.trim());
}

function isHighPriority(cell: string): boolean {
  return /^h(igh)?\b/i.test(cell.trim());
}

export function checkRiskActionRows(ctx: EvaluationContext) {
  const parsed = parseRiskActionMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("met", "No recommended actions recorded");
  }
  const problems: string[] = [];
  parsed.rows.forEach((row, index) => {
    const label = rowLabel(row.serial, index);
    if (!row.risk.trim()) problems.push(`${label} has no risk description`);
    if (!row.source.trim()) problems.push(`${label} has no source`);
    if (!row.occurrence.trim()) {
      problems.push(`${label} has no occurrence`);
    }
    if (!row.severity.trim()) problems.push(`${label} has no severity`);
    if (!isPriorityCell(row.priority)) {
      problems.push(`${label} priority must be High, Medium or Low`);
    }
    if (!row.action.trim()) problems.push(`${label} has no recommended action`);
    if (!row.owner.trim()) problems.push(`${label} has no owner`);
    if (!row.targetDate.trim()) problems.push(`${label} has no target date`);
  });
  return listProblems(
    problems,
    `${parsed.rows.length} recommended action(s) recorded`
  );
}

const GRADE_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

function increasingHighImpactThemes(content: unknown): boolean {
  const parsed = parseSystemTrendsMatrix(content);
  if (!parsed.ok) return false;
  return parsed.rows.some(
    (row) =>
      /increas/i.test(row.trend) &&
      /high|scrap|discard|runtime|downtime|lost|availability/i.test(row.impact)
  );
}

function riskGradeFloor(ctx: EvaluationContext): ElrRiskGrade | null {
  const breakdowns = ctx.dependencies.elr_breakdowns ?? {};
  const trends = ctx.dependencies.elr_system_trends ?? {};
  const downtime = totalBreakdownDowntime(breakdowns);
  const scrap =
    contentMentionsScrap(breakdowns) ||
    contentMentionsScrap(trends) ||
    contentMentionsScrap(ctx.content);
  if (scrap || downtime >= 8) return "high";
  if (downtime > 0 || increasingHighImpactThemes(trends)) return "medium";
  return null;
}

export function checkRiskGradeConsistent(ctx: EvaluationContext) {
  const content = ctx.content as
    | { overallGrade?: ElrRiskGrade }
    | null
    | undefined;
  const grade = (content?.overallGrade ?? "").trim();
  if (!grade) {
    return verdict("not_met", "No overall report risk grade selected");
  }
  if (
    !(ELR_RISK_GRADES as readonly string[]).includes(grade)
  ) {
    return verdict("not_met", `Unknown risk grade (${grade})`);
  }
  const parsed = parseRiskActionMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  const highCount = parsed.rows.filter((r) => isHighPriority(r.priority)).length;
  if (grade === "low" && highCount > 0) {
    return verdict(
      "not_met",
      `${highCount} High-priority action(s) recorded — overall grade cannot be Low`
    );
  }
  const floor = riskGradeFloor(ctx);
  if (floor && (GRADE_RANK[grade] ?? 0) < GRADE_RANK[floor]) {
    return verdict(
      "not_met",
      `Overall grade ${grade} is below the floor (${floor}) from downtime, scrap or increasing high-impact themes`
    );
  }
  return verdict("met", `Overall grade recorded (${grade})`);
}

export function checkRiskActionsNotBloated(ctx: EvaluationContext) {
  const parsed = parseRiskActionMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  const flags = flaggedFindings(ctx.dependencies);
  if (parsed.rows.length === 0 && flags.length > 0) {
    return verdict(
      "not_met",
      `Flagged findings are present (${flags.join("; ")}) but no recommended actions are recorded`
    );
  }
  if (parsed.rows.length > ELR_RISK_ACTION_MAX_ROWS) {
    return verdict(
      "partially_met",
      `${parsed.rows.length} actions — consolidate related risks; ${ELR_RISK_ACTION_MAX_ROWS} is a working ceiling`
    );
  }
  if (parsed.rows.length === 0) {
    return verdict("met", "No flagged findings requiring an action");
  }
  return verdict("met", `${parsed.rows.length} recommended action(s)`);
}

/** Exported for tests that assert the Y/N helpers behave on real MJ phrasing. */
export const __cellHelpers = { isYes, isNo, hasReference, isDirectImpact };
