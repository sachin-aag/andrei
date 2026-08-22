import type { CriterionStatus } from "@/db/schema";
import type { EvaluationContext } from "@/lib/document-types/types";
import {
  normalizePassFail,
  parseEquipmentMatrix,
  parseFlexibleDate,
  parseResultsMatrix,
} from "./matrix-parser";

function verdict(
  status: CriterionStatus,
  reasoning: string
): { status: CriterionStatus; reasoning: string } {
  return { status, reasoning };
}

export function checkEquipmentTablePresent(ctx: EvaluationContext) {
  const parsed = parseEquipmentMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  const required = ["Equipment", "Manufacturer", "Model/Part No."];
  const missingRequired = parsed.missingColumns.filter((c) =>
    required.includes(c)
  );
  if (missingRequired.length > 0) {
    return verdict(
      "not_met",
      `Equipment table is missing column(s): ${missingRequired.join(", ")}`
    );
  }
  if (parsed.rows.length === 0) {
    return verdict("not_met", "Equipment table has no data rows");
  }
  return verdict(
    "met",
    `Equipment table present with ${parsed.rows.length} row(s)`
  );
}

export function checkEquipmentCalibrationDates(ctx: EvaluationContext) {
  const parsed = parseEquipmentMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.missingColumns.includes("Calibration Due")) {
    return verdict("not_met", "Equipment table has no Calibration Due column");
  }
  if (parsed.rows.length === 0) {
    return verdict("not_met", "Equipment table has no data rows");
  }
  const missing = parsed.rows.filter((r) => !r.calibrationDue.trim());
  if (missing.length > 0) {
    return verdict(
      "partially_met",
      `${missing.length} row(s) missing a calibration due date`
    );
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expired = parsed.rows.filter((r) => {
    const due = parseFlexibleDate(r.calibrationDue);
    return due !== null && due < today;
  });
  if (expired.length > 0) {
    return verdict(
      "partially_met",
      `${expired.length} instrument(s) have a calibration due date in the past`
    );
  }
  return verdict("met", "Every equipment row has a calibration due date");
}

export function checkResultsMatrixComplete(ctx: EvaluationContext) {
  const parsed = parseResultsMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  const required = ["Req ID", "P/F"];
  const missingRequired = parsed.missingColumns.filter((c) =>
    required.includes(c)
  );
  if (missingRequired.length > 0) {
    return verdict(
      "not_met",
      `Results table is missing column(s): ${missingRequired.join(", ")}`
    );
  }
  if (parsed.rows.length === 0) {
    return verdict("not_met", "Results table has no data rows");
  }
  const incomplete = parsed.rows.filter(
    (r) => !r.requirementId.trim() || !r.passFail.trim()
  );
  if (incomplete.length > 0) {
    return verdict(
      "partially_met",
      `${incomplete.length} row(s) missing Req ID or P/F`
    );
  }
  return verdict(
    "met",
    `Results table present with ${parsed.rows.length} complete Req ID / P/F row(s)`
  );
}

export function checkResultsPassFailValues(ctx: EvaluationContext) {
  const parsed = parseResultsMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("not_met", "Results table has no data rows");
  }
  const invalid = parsed.rows.filter(
    (r) => r.passFail.trim() && normalizePassFail(r.passFail) === null
  );
  if (invalid.length > 0) {
    return verdict(
      "not_met",
      `${invalid.length} row(s) have a P/F value that is not Pass or Fail`
    );
  }
  const blank = parsed.rows.filter((r) => !r.passFail.trim());
  if (blank.length > 0) {
    return verdict("partially_met", `${blank.length} row(s) missing P/F`);
  }
  return verdict("met", "Every results row has a Pass or Fail verdict");
}

export function checkResultsIdsUnique(ctx: EvaluationContext) {
  const parsed = parseResultsMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  const ids = parsed.rows.map((r) => r.requirementId.trim()).filter(Boolean);
  if (ids.length === 0) {
    return verdict("not_met", "No requirement IDs in the results table");
  }
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    const key = id.toLowerCase();
    if (seen.has(key)) dupes.add(id);
    seen.add(key);
  }
  if (dupes.size > 0) {
    return verdict(
      "partially_met",
      `Duplicate requirement ID(s): ${[...dupes].join(", ")}`
    );
  }
  return verdict("met", "Requirement IDs in the results table are unique");
}
