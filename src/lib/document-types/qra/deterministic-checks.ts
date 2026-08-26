import type { CriterionStatus } from "@/db/schema";
import type { EvaluationContext } from "@/lib/document-types/types";
import {
  parseFmeaMatrix,
  parseMitigationMatrix,
  parseQraRevisionHistoryMatrix,
  parseRiskIdentificationMatrix,
  parseTeamMatrix,
  type FmeaRow,
} from "./matrix-parser";
import { computeFromInputs, normalizeComputedCell } from "./recalculate-table";
import {
  mitigationRequired,
  parseYesNo,
  selectAssessmentMode,
  type AssessmentMode,
} from "./scoring";

function verdict(
  status: CriterionStatus,
  reasoning: string
): { status: CriterionStatus; reasoning: string } {
  return { status, reasoning };
}

function narrativeText(content: unknown): string {
  return JSON.stringify(
    (content as { narrative?: unknown } | null)?.narrative ?? ""
  );
}

function approachFrom(ctx: EvaluationContext): {
  mode: AssessmentMode | "";
  derived: AssessmentMode | null;
} {
  const src =
    (ctx.dependencies.qra_approach as Record<string, unknown> | undefined) ??
    (ctx.content as Record<string, unknown> | undefined) ??
    {};
  const impact = parseYesNo(String(src.impactKnown ?? ""));
  const defined = parseYesNo(String(src.scopeDefined ?? ""));
  const narrow = parseYesNo(String(src.scopeNarrow ?? ""));
  const derived =
    impact != null && defined != null && narrow != null
      ? selectAssessmentMode({
          impactKnown: impact,
          scopeDefined: defined,
          scopeNarrow: narrow,
        })
      : null;
  const stored = String(src.assessmentMode ?? "").trim();
  const mode: AssessmentMode | "" =
    stored === "qualitative" || stored === "quantitative" ? stored : "";
  return { mode, derived };
}

export function checkA02Mode(ctx: EvaluationContext) {
  const { mode, derived } = approachFrom(ctx);
  if (!derived) {
    return verdict(
      "not_met",
      "Answer the three A02 questions (impact known, scope defined, scope narrow) with Yes or No"
    );
  }
  if (!mode) {
    return verdict(
      "not_met",
      `A02 selects ${derived} assessment but no mode is recorded`
    );
  }
  if (mode !== derived) {
    return verdict(
      "not_met",
      `A02 answers select ${derived} assessment but the recorded mode is ${mode}`
    );
  }
  return verdict("met", `A02 answers select ${mode} assessment`);
}

function requiredColumns(
  parsed: { ok: true; missingColumns: string[] } | { ok: false; reason: string },
  required: readonly string[],
  label: string
) {
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  const missing = parsed.missingColumns.filter((c) => required.includes(c));
  if (missing.length > 0) {
    return verdict(
      "not_met",
      `${label} is missing column(s): ${missing.join(", ")}`
    );
  }
  return null;
}

export function checkTeamTable(ctx: EvaluationContext) {
  const parsed = parseTeamMatrix(ctx.content);
  const missing = requiredColumns(
    parsed,
    ["Name", "Department"],
    "Team table"
  );
  if (missing) return missing;
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("not_met", "Risk assessment team table has no members");
  }
  const incomplete = parsed.rows.filter((r) => !r.name.trim() || !r.department.trim());
  if (incomplete.length > 0) {
    return verdict(
      "partially_met",
      `${incomplete.length} team row(s) are missing a name or department`
    );
  }
  return verdict("met", `${parsed.rows.length} team member(s) listed`);
}

export function checkRiskIdentificationTable(ctx: EvaluationContext) {
  const parsed = parseRiskIdentificationMatrix(ctx.content);
  const missing = requiredColumns(
    parsed,
    ["Process / activity", "Identify Failure"],
    "Risk identification table"
  );
  if (missing) return missing;
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("not_met", "No process / failure rows are listed");
  }
  return verdict("met", `${parsed.rows.length} identified failure(s)`);
}

const FMEA_REQUIRED = [
  "Sr. No.",
  "Process / activity",
  "Potential Failure",
  "Severity (S)",
  "Probability (P)",
  "Detectability (D)",
  "RPN / RPR",
];

function resolveMode(ctx: EvaluationContext): AssessmentMode | null {
  const { mode, derived } = approachFrom(ctx);
  if (mode) return mode;
  return derived;
}

function rowHasScores(row: FmeaRow): boolean {
  return Boolean(
    row.severity.trim() && row.probability.trim() && row.detectability.trim()
  );
}

export function checkFmeaTablePresent(ctx: EvaluationContext) {
  const parsed = parseFmeaMatrix(ctx.content);
  const missing = requiredColumns(parsed, FMEA_REQUIRED, "FMEA table");
  if (missing) return missing;
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("not_met", "FMEA table has no data rows");
  }
  const unscored = parsed.rows.filter((r) => !rowHasScores(r));
  if (unscored.length === parsed.rows.length) {
    return verdict(
      "not_met",
      "Every FMEA row is missing Severity, Probability or Detectability"
    );
  }
  if (unscored.length > 0) {
    return verdict(
      "partially_met",
      `${unscored.length} of ${parsed.rows.length} row(s) are missing S, P or D`
    );
  }
  return verdict("met", `${parsed.rows.length} scored failure mode(s)`);
}

export function checkFmeaScoresOnScale(ctx: EvaluationContext) {
  const mode = resolveMode(ctx);
  if (!mode) {
    return verdict("not_met", "Record qualitative vs quantitative mode first");
  }
  const parsed = parseFmeaMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  const problems: string[] = [];
  for (const row of parsed.rows.filter(rowHasScores)) {
    const result = computeFromInputs(
      mode,
      row.severity,
      row.probability,
      row.detectability,
      false
    );
    if (result && "error" in result) {
      problems.push(`${row.riskId || "row"}: ${result.error}`);
    }
  }
  if (problems.length > 0) {
    return verdict("not_met", problems.slice(0, 5).join("; "));
  }
  return verdict("met", `All filled S/P/D cells match the ${mode} scale`);
}

export function checkFmeaScoresRecalculated(ctx: EvaluationContext) {
  const mode = resolveMode(ctx);
  if (!mode) {
    return verdict("not_met", "Record qualitative vs quantitative mode first");
  }
  const parsed = parseFmeaMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  const stale: string[] = [];
  for (const row of parsed.rows.filter(rowHasScores)) {
    const result = computeFromInputs(
      mode,
      row.severity,
      row.probability,
      row.detectability,
      false
    );
    if (!result || "error" in result) continue;
    if (normalizeComputedCell(row.rpn) !== normalizeComputedCell(result.display)) {
      stale.push(
        `${row.riskId || "row"} shows ${row.rpn || "(empty)"} but should be ${result.display}`
      );
    }
  }
  if (stale.length > 0) {
    return verdict(
      "not_met",
      `Recalculate risk scores: ${stale.slice(0, 4).join("; ")}`
    );
  }
  return verdict("met", "Stored RPN/RPR cells match the SOP calculation");
}

export function checkMitigationForElevatedRisk(ctx: EvaluationContext) {
  const mode = resolveMode(ctx);
  if (!mode) {
    return verdict("not_met", "Record qualitative vs quantitative mode first");
  }
  const parsed = parseFmeaMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  const missing: string[] = [];
  for (const row of parsed.rows.filter(rowHasScores)) {
    const result = computeFromInputs(
      mode,
      row.severity,
      row.probability,
      row.detectability,
      false
    );
    if (!result || "error" in result) continue;
    if (!mitigationRequired(result.band)) continue;
    if (!row.mitigation.trim() || !row.responsibility.trim()) {
      missing.push(
        `${row.riskId || "row"} is ${result.band} and needs a mitigation plan, owner and TCD`
      );
    }
  }
  if (missing.length > 0) {
    return verdict("not_met", missing.slice(0, 4).join("; "));
  }
  return verdict("met", "Medium and high risks have mitigation, owner and TCD");
}

export function checkMitigationTracker(ctx: EvaluationContext) {
  const fmea = parseFmeaMatrix(ctx.dependencies.qra_fmea ?? {});
  const mode = resolveMode({
    ...ctx,
    content: ctx.dependencies.qra_approach ?? ctx.content,
    dependencies: ctx.dependencies,
  });
  let needsTracker = false;
  if (fmea.ok && mode) {
    needsTracker = fmea.rows.some((row) => {
      if (!rowHasScores(row)) return false;
      const result = computeFromInputs(
        mode,
        row.severity,
        row.probability,
        row.detectability,
        false
      );
      return Boolean(result && !("error" in result) && mitigationRequired(result.band));
    });
  }
  const parsed = parseMitigationMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (!needsTracker && parsed.rows.length === 0) {
    return verdict("met", "No elevated risks, so the closure tracker may stay empty");
  }
  if (parsed.rows.length === 0) {
    return verdict(
      "not_met",
      "Medium or high risks are present; record mitigation closure (plan, owner, dates)"
    );
  }
  return verdict("met", `${parsed.rows.length} mitigation tracker row(s)`);
}

export function checkResidualRiskTable(ctx: EvaluationContext) {
  const parsed = parseFmeaMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  const required = ["Sr. No.", "Severity (S)", "Probability (P)", "Detectability (D)"];
  const missing = parsed.missingColumns.filter((c) => required.includes(c));
  if (missing.length > 0) {
    return verdict(
      "not_met",
      `Residual-risk table is missing column(s): ${missing.join(", ")}`
    );
  }
  if (parsed.rows.length === 0) {
    return verdict(
      "met",
      "No new or residual risks recorded (F04 is optional when none arose)"
    );
  }
  const unscored = parsed.rows.filter((r) => !rowHasScores(r));
  if (unscored.length > 0) {
    return verdict(
      "partially_met",
      `${unscored.length} residual-risk row(s) are missing S, P or D`
    );
  }
  return verdict("met", `${parsed.rows.length} new/residual risk row(s) scored`);
}

export function checkPeriodicReviewAnswered(ctx: EvaluationContext) {
  const applicable = String(
    (ctx.content as { applicable?: unknown } | null)?.applicable ?? ""
  ).trim();
  const parsed = parseYesNo(applicable);
  if (parsed == null) {
    return verdict(
      "not_met",
      "Say whether periodic review applies (Yes/No) and justify if No"
    );
  }
  if (!parsed && narrativeText(ctx.content).length < 40) {
    return verdict(
      "partially_met",
      "Periodic review is marked No; add a short justification"
    );
  }
  return verdict(
    "met",
    parsed
      ? "Periodic review is marked applicable"
      : "Periodic review is marked not applicable with a justification"
  );
}

export function checkRevisionHistory(ctx: EvaluationContext) {
  const parsed = parseQraRevisionHistoryMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("not_met", "Revision history has no rows");
  }
  const empty = parsed.rows.filter((r) => !r.revision.trim() || !r.change.trim());
  if (empty.length > 0) {
    return verdict(
      "partially_met",
      `${empty.length} revision-history row(s) are missing a revision or change`
    );
  }
  return verdict("met", `${parsed.rows.length} revision(s) recorded`);
}

export function checkNarrativePresent(ctx: EvaluationContext) {
  const text = narrativeText(ctx.content);
  if (text.replace(/[{}\[\]"]/g, "").trim().length < 20) {
    return verdict("not_met", "This section is still empty");
  }
  return verdict("met", "Narrative is present");
}
