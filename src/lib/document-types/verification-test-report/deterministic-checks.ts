import type { EvaluationContext } from "../types";
import { verdict } from "../criterion-helpers";
import { asLedger } from "../verification-protocol/sections";
import { requirementsVerifiedRows } from "@/lib/design-inputs/requirements-verified";
import { asTestReportMethods } from "./sections";

/**
 * Requirements Verified is generated from the ledger: complete for live
 * requirements, no pass/fail column, modification count computed from the
 * pulled register. Product IDs are not part of this rule.
 */
export function checkRequirementsVerifiedGenerated(ctx: EvaluationContext) {
  const ledger = asLedger(ctx.dependencies.design_inputs);
  const live = ledger.requirements.filter((req) => req.removedInRev === null);
  if (live.length === 0) {
    return verdict(
      "not_met",
      "No live requirements in the ledger — Requirements Verified cannot be generated."
    );
  }

  const rows = requirementsVerifiedRows(ledger);
  if (rows.length !== live.length) {
    return verdict(
      "not_met",
      `Generated table has ${rows.length} row(s) but ${live.length} live requirement(s).`
    );
  }

  const hasPassFail = rows.some(
    (row) =>
      Object.prototype.hasOwnProperty.call(row, "passFail") ||
      Object.prototype.hasOwnProperty.call(row, "pf")
  );
  if (hasPassFail) {
    return verdict(
      "not_met",
      "Requirements Verified must not include a pass/fail column."
    );
  }

  const methods = asTestReportMethods(ctx.dependencies.methods_of_measurement);
  const typed = (methods as { typedModificationCount?: unknown })
    .typedModificationCount;
  if (typeof typed === "number" || typeof typed === "string") {
    return verdict(
      "not_met",
      "Modification count must be computed from the pulled register, not typed."
    );
  }

  const computed = methods.protocolModifications?.rows.length ?? 0;
  return verdict(
    "met",
    `Requirements Verified generated for ${rows.length} live requirement(s). Protocol modifications count is computed (${computed}).`
  );
}
