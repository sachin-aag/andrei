import type { CriterionStatus } from "@/db/schema";
import type { EvaluationContext } from "../types";
import {
  parseTestResultsMatrix,
  parseTraceabilityMatrix,
} from "./matrix-parser";
import { designVerificationMetadata } from "@/types/report";

function verdict(
  status: CriterionStatus,
  reasoning: string
): { status: CriterionStatus; reasoning: string } {
  return { status, reasoning };
}

export function checkTraceabilityComplete(ctx: EvaluationContext) {
  const parsed = parseTraceabilityMatrix(ctx.content);
  if (!parsed.ok) {
    return verdict("not_met", parsed.reason);
  }
  if (parsed.rows.length === 0) {
    return verdict("not_met", "Traceability matrix has no data rows");
  }
  if (
    parsed.missingColumns.includes("Requirement ID") ||
    parsed.missingColumns.includes("Test Method / ID")
  ) {
    return verdict(
      "partially_met",
      `Matrix is missing column(s): ${parsed.missingColumns
        .filter((c) => c === "Requirement ID" || c === "Test Method / ID")
        .join(", ")}`
    );
  }
  const incomplete = parsed.rows.filter(
    (r) => !r.requirementId || !r.testMethodId
  );
  if (incomplete.length > 0) {
    return verdict(
      "partially_met",
      `${incomplete.length} row(s) missing Requirement ID or Test Method / ID`
    );
  }
  return verdict(
    "met",
    `Traceability matrix present with ${parsed.rows.length} complete row(s)`
  );
}

export function checkEveryInputHasTest(ctx: EvaluationContext) {
  const parsed = parseTraceabilityMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.missingColumns.includes("Test Method / ID")) {
    return verdict(
      "not_met",
      "Matrix has no Test Method / ID column — cannot verify each design input has a test"
    );
  }
  if (parsed.rows.length === 0) {
    return verdict("not_met", "No design inputs listed in the matrix");
  }
  const missing = parsed.rows.filter(
    (r) => r.requirementId && !r.testMethodId
  );
  if (missing.length > 0) {
    return verdict(
      "not_met",
      `${missing.length} design input(s) lack a corresponding verification test method: ${missing
        .map((r) => r.requirementId)
        .join(", ")}`
    );
  }
  return verdict(
    "met",
    "Every design input has at least one corresponding verification test method"
  );
}

export function checkNoOrphanTests(ctx: EvaluationContext) {
  const parsed = parseTraceabilityMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.missingColumns.includes("Requirement ID")) {
    return verdict(
      "not_met",
      "Matrix has no Requirement ID column — cannot verify tests map to design inputs"
    );
  }
  const orphans = parsed.rows.filter(
    (r) => r.testMethodId && !r.requirementId
  );
  if (orphans.length > 0) {
    return verdict(
      "not_met",
      `${orphans.length} orphan test(s) with no design input: ${orphans
        .map((r) => r.testMethodId)
        .join(", ")}`
    );
  }
  return verdict(
    "met",
    "Every verification test maps back to a specific design input"
  );
}

export function checkRiskControlLinks(ctx: EvaluationContext) {
  const parsed = parseTraceabilityMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.rows.length === 0) {
    return verdict("not_met", "Traceability matrix is empty");
  }
  if (parsed.missingColumns.includes("Risk Control Link")) {
    return verdict(
      "not_met",
      "No Risk Control Link column found in the matrix"
    );
  }
  const missing = parsed.rows.filter((r) => !r.riskControlLink);
  if (missing.length === parsed.rows.length) {
    return verdict(
      "not_met",
      "No risk management / hazard control links present in the matrix"
    );
  }
  if (missing.length > 0) {
    return verdict(
      "partially_met",
      `${missing.length} of ${parsed.rows.length} row(s) missing risk control links`
    );
  }
  return verdict(
    "met",
    "Traceability links to risk management file present for all rows"
  );
}

export function checkConsistentRequirementIds(ctx: EvaluationContext) {
  const parsed = parseTraceabilityMatrix(ctx.content);
  if (!parsed.ok) return verdict("not_met", parsed.reason);
  if (parsed.missingColumns.includes("Requirement ID")) {
    return verdict("not_met", "No Requirement ID column found in the matrix");
  }
  const ids = parsed.rows.map((r) => r.requirementId).filter(Boolean);
  if (ids.length === 0) {
    return verdict("not_met", "No requirement IDs found");
  }
  const ambiguous = ids.filter((id) => /\s{2,}/.test(id) || id.length < 2);
  if (ambiguous.length > 0) {
    return verdict(
      "partially_met",
      `${ambiguous.length} requirement ID(s) look ambiguous or underspecified`
    );
  }
  return verdict(
    "met",
    "Traceability matrix uses consistent, unambiguous requirement IDs"
  );
}

export function checkResultsTraceToRequirements(ctx: EvaluationContext) {
  const results = parseTestResultsMatrix(ctx.content);
  if (!results.ok) return verdict("not_met", results.reason);
  if (results.rows.length === 0) {
    return verdict("not_met", "No test results rows present");
  }
  const absentIds = results.missingColumns.filter(
    (c) => c === "Test ID" || c === "Requirement ID"
  );
  if (absentIds.length > 0) {
    return verdict(
      "not_met",
      `Results matrix is missing column(s): ${absentIds.join(", ")}`
    );
  }
  const missing = results.rows.filter((r) => !r.requirementId || !r.testId);
  if (missing.length > 0) {
    return verdict(
      "not_met",
      `${missing.length} result row(s) missing Test ID or Requirement ID`
    );
  }
  const traceability = parseTraceabilityMatrix(
    ctx.dependencies.traceability
  );
  if (traceability.ok) {
    const known = new Set(
      traceability.rows.map((r) => r.requirementId).filter(Boolean)
    );
    const orphans = results.rows.filter(
      (r) => r.requirementId && known.size > 0 && !known.has(r.requirementId)
    );
    if (orphans.length > 0) {
      return verdict(
        "partially_met",
        `${orphans.length} result(s) reference requirement IDs not in the traceability matrix`
      );
    }
  }
  return verdict(
    "met",
    "Results are traceable back to specific requirement/test IDs"
  );
}

export function checkCoverPageIdentity(ctx: EvaluationContext) {
  const meta = designVerificationMetadata(ctx.report);
  const missing: string[] = [];
  if (!ctx.report.documentNo) missing.push("document ID");
  if (!meta.revision) missing.push("revision");
  if (missing.length === 2) {
    return verdict("not_met", `Missing ${missing.join(", ")}`);
  }
  if (missing.length > 0) {
    return verdict("partially_met", `Missing ${missing.join(", ")}`);
  }
  return verdict("met", "Document has unique ID and revision number");
}

export function checkCoverPageProduct(ctx: EvaluationContext) {
  const meta = designVerificationMetadata(ctx.report);
  if (!meta.productName) {
    return verdict("not_met", "Missing product name");
  }
  return verdict("met", "Product name is identified");
}
