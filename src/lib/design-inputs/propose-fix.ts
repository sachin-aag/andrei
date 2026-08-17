import type { Finding, Ledger, ModificationRow } from "./types";

export function withProposedFixes(
  findings: Finding[],
  ledger: Ledger
): Finding[] {
  return findings.map((finding) => ({
    ...finding,
    proposedFix: proposeFix(finding, ledger),
  }));
}

export function proposeFix(
  finding: Finding,
  ledger: Ledger
): ModificationRow | null {
  if (
    finding.disposition === "clean" ||
    finding.disposition === "needs_confirmation"
  ) {
    return null;
  }

  const reqId = finding.reqIds[0] ?? "";
  const block = blockForFinding(finding, ledger);
  const quote = finding.evidence[0]?.quote ?? "";

  switch (finding.check) {
    case "declared_but_untested":
      return row(finding, {
        kind: "added",
        target: "protocol",
        blockId: block?.id ?? null,
        before: reqId ? `No test row for ${reqId}` : "Claimed ID has no test row",
        after: `Add a test row in ${block?.title ?? "the claiming block"} that exercises ${reqId || "the claimed requirement"}`,
        rationale:
          "Claimed coverage must match actual test-method rows (SOP §6.5 / §10.1).",
      });
    case "dangling_id":
      return row(finding, {
        kind: "modified",
        target: "srs",
        blockId: null,
        before: quote,
        after: `Retarget the citation of ${reqId} to a live SRS identifier, or add ${reqId} to the stated SRS revision`,
        rationale: "Every cited requirement ID must resolve in the stated SRS revision.",
      });
    case "live_untested":
      return row(finding, {
        kind: "added",
        target: "protocol",
        blockId: block?.id ?? null,
        before: reqId,
        after: `Add a test method for ${reqId}, or record a documented out-of-scope rationale`,
        rationale:
          "Every live, non-deferred requirement must be tested or explicitly scoped out.",
      });
    case "applicability_vs_jcode":
      return row(finding, {
        kind: "modified",
        target: "plan",
        blockId: null,
        before: quote,
        after: `Align the plan configuration code for ${reqId} with the requirement applicability note: ${quote}`,
        rationale:
          "Plan configuration codes must not require configurations outside the requirement’s applicability note.",
      });
    case "one_jcode_per_req":
      return row(finding, {
        kind: "modified",
        target: "plan",
        blockId: null,
        before: quote,
        after: `Keep one configuration code for ${reqId} per plan revision, or record the narrowing rationale`,
        rationale:
          "Two configuration codes for the same requirement need a recorded narrowing.",
      });
    case "equipment_gap":
      return row(finding, {
        kind: "added",
        target: "equipment_table",
        blockId: null,
        before: "",
        after: quote.replace(
          " is named in test methods but not in the equipment table",
          " — add to the equipment table with calibration tracking"
        ),
        rationale:
          "Instruments named in methods must appear in the equipment table (SOP §8.5).",
      });
    case "obsolete_still_present":
      return row(finding, {
        kind: "removed",
        target: "protocol",
        blockId: block?.id ?? null,
        before: quote,
        after: `Drop ${reqId} from live protocol coverage (keep a tombstone row if the removal must remain visible)`,
        rationale: "Removed SRS IDs must not reappear as live coverage.",
      });
    case "tilde_tolerance":
    case "non_normative":
    case "datasheet_n1":
    case "banner_dupes":
      return row(finding, {
        kind: "modified",
        target: "protocol",
        blockId: block?.id ?? null,
        before: quote,
        after:
          "Triage this review-queue item: replace approximations with an explicit tolerance, and record sample size or configuration execution where it is only implied.",
        rationale: "Measurability and coverage claims should be reviewable, not implicit.",
      });
    default:
      return null;
  }
}

function blockForFinding(finding: Finding, ledger: Ledger) {
  const reqId = finding.reqIds[0];
  if (!reqId) return undefined;
  return ledger.blocks.find(
    (b) =>
      b.declaredReqIds.includes(reqId) ||
      b.bannerReqIds.includes(reqId) ||
      b.testedReqIds.includes(reqId)
  );
}

function row(
  finding: Finding,
  fields: Omit<ModificationRow, "findingId" | "status">
): ModificationRow {
  return {
    findingId: finding.id,
    status: "proposed",
    ...fields,
  };
}
