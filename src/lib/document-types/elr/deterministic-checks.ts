import type { CriterionStatus } from "@/db/schema";
import type { EvaluationContext } from "@/lib/document-types/types";
import { collectQuantityMathSamples } from "@/lib/math/quantity-math";
import {
  hasReference,
  isDelayed,
  isDirectImpact,
  isNo,
  isOutOfTolerance,
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
import { extractRawRows } from "@/lib/document-types/design-verification/matrix-parser";
import { tableFieldDoc } from "@/lib/document-types/qra/matrix-parser";
import {
  ELR_FORMAT_APPLICABILITY,
  ELR_RISK_ACTION_MAX_ROWS,
  ELR_RISK_GRADES,
  type ElrRecommendation,
  type ElrRiskGrade,
} from "./sections";

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
      "No access changes listed — state the current user list or mark the section Not Applicable"
    );
  }
  const problems: string[] = [];
  parsed.rows.forEach((row, index) => {
    const label = rowLabel(row.serial, index);
    if (!row.systemName.trim()) problems.push(`${label} has no system name`);
    if (!row.role.trim()) problems.push(`${label} has no privilege level`);
  });
  return listProblems(problems, `${parsed.rows.length} access record(s)`);
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
  const text = narrativeText(ctx.content);
  if (text.length < 40) {
    return verdict(
      "not_met",
      `The table has ${rows} row(s) but the assessment is empty or a one-liner — interpret the counts, implication, and any product or runtime impact`
    );
  }
  if (!/\d/.test(text)) {
    return verdict(
      "not_met",
      "The assessment does not state a count from the table"
    );
  }
  return verdict("met", "Assessment is present and includes a count");
}

function flaggedFindings(dependencies: Record<string, unknown>): string[] {
  const flags: string[] = [];

  const breakdowns = parseBreakdownMatrix(dependencies.elr_breakdowns ?? {});
  if (breakdowns.ok) {
    const n = breakdowns.rows.filter((r) => isYes(r.repeat)).length;
    if (n > 0) flags.push(`${n} repeat breakdown(s)`);
  }

  const alarms = parseAlarmMatrix(dependencies.elr_alarms ?? {});
  if (alarms.ok) {
    const n = alarms.rows.filter((r) => isDirectImpact(r.criticality)).length;
    if (n > 0) flags.push(`${n} Direct Impact alarm(s)`);
  }

  const monitoring = parseMonitoringMatrix(dependencies.elr_monitoring ?? {});
  if (monitoring.ok) {
    const n = monitoring.rows.filter((r) => isYes(r.excursion)).length;
    if (n > 0) flags.push(`${n} monitoring excursion(s)`);
  }

  const calibration = parseCalibrationMatrix(dependencies.elr_calibration ?? {});
  if (calibration.ok) {
    const n = calibration.rows.filter((r) => isOutOfTolerance(r.result)).length;
    if (n > 0) flags.push(`${n} out-of-tolerance calibration(s)`);
  }

  const pm = parsePreventiveMaintenanceMatrix(
    dependencies.elr_preventive_maintenance ?? {}
  );
  if (pm.ok) {
    const n = pm.rows.filter((r) => isDelayed(r.status)).length;
    if (n > 0) flags.push(`${n} delayed PM(s)`);
  }

  const qms = parseQmsMatrix(dependencies.elr_qms ?? {});
  if (qms.ok) {
    const n = qms.rows.filter((r) => isYes(r.qualificationImpact)).length;
    if (n > 0) flags.push(`${n} qualification-impacting QMS record(s)`);
  }

  return flags;
}

export function checkSystemTrendRows(ctx: EvaluationContext) {
  const parsed = parseSystemTrendsMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("met", "No system trends recorded");
  }
  const problems: string[] = [];
  parsed.rows.forEach((row, index) => {
    const label = rowLabel(row.serial, index);
    if (!row.theme.trim()) problems.push(`${label} has no theme`);
    if (!row.whereSeen.trim()) {
      problems.push(`${label} does not say where the theme was seen`);
    }
    if (!row.occurrences.trim()) {
      problems.push(`${label} has no occurrence count`);
    }
    if (!row.impact.trim()) {
      problems.push(`${label} has no product or runtime impact`);
    }
  });
  return listProblems(problems, `${parsed.rows.length} system trend(s) recorded`);
}

export function checkSystemTrendsCoverFlaggedFindings(ctx: EvaluationContext) {
  const flags = flaggedFindings(ctx.dependencies);
  if (flags.length === 0) {
    return verdict("met", "No flagged findings that require a system-trend row");
  }
  const parsed = parseSystemTrendsMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict(
      "not_met",
      `Flagged findings are present (${flags.join("; ")}) but the system-trends table is empty`
    );
  }
  return verdict(
    "met",
    `${parsed.rows.length} trend theme(s) against ${flags.length} flagged finding group(s)`
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
