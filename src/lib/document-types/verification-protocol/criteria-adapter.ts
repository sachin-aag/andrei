import type { Finding } from "@/lib/design-inputs/types";
import type { EvaluationContext } from "../types";
import { verdict } from "../criterion-helpers";
import { asFindings, asSources, missingSourceIdentityFields } from "./sections";

const CHECKS_BY_CRITERION: Record<string, readonly string[]> = {
  "findings.ids_resolve": ["dangling_id"],
  "findings.live_coverage": ["live_untested"],
  "findings.claimed_vs_tested": ["declared_but_untested", "banner_dupes"],
  "findings.obsolete_absent": ["obsolete_still_present"],
  "findings.applicability_vs_plan": ["applicability_vs_jcode"],
  "findings.one_config_code": ["one_jcode_per_req"],
  "findings.equipment_listed": ["equipment_gap"],
  "findings.quantitative_tolerance": ["tilde_tolerance"],
  "findings.normative_language": ["non_normative"],
  "findings.sample_size": ["datasheet_n1"],
};

export function checkSourcesIdentity(ctx: EvaluationContext) {
  const missing = missingSourceIdentityFields(ctx.content);
  if (missing.length === 0) {
    const sources = asSources(ctx.content);
    return verdict(
      "met",
      `Protocol ${sources.protocolNo} ${sources.protocolRev}, SRS ${sources.srsNo} ${sources.srsRev}, plan ${sources.planNo} ${sources.planRev}`
    );
  }
  if (missing.length >= 5) {
    return verdict("not_met", `Missing ${missing.join(", ")}`);
  }
  return verdict("partially_met", `Missing ${missing.join(", ")}`);
}

export function checkFindingsCriterion(criterionKey: string) {
  const checkKeys = CHECKS_BY_CRITERION[criterionKey];
  if (!checkKeys) {
    throw new Error(`No check mapping for criterion ${criterionKey}`);
  }
  return (ctx: EvaluationContext) => {
    const items = asFindings(ctx.content).items;
    if (items.length === 0) {
      return verdict(
        "not_met",
        "No findings have been generated yet — run the protocol check first."
      );
    }
    const relevant = items.filter((f) => checkKeys.includes(f.check));
    const defects = relevant.filter((f) => f.disposition === "defect");
    if (defects.length > 0) {
      return verdict(
        "not_met",
        summarize(defects, "Defects")
      );
    }
    const confirm = relevant.filter(
      (f) => f.disposition === "needs_confirmation"
    );
    if (confirm.length > 0) {
      return verdict("partially_met", summarize(confirm, "Needs confirmation"));
    }
    const queue = relevant.filter((f) => f.disposition === "review_queue");
    if (queue.length > 0) {
      return verdict("partially_met", summarize(queue, "Queued for review"));
    }
    return verdict("met", metReasoning(criterionKey, relevant));
  };
}

function summarize(findings: Finding[], lead: string): string {
  const ids = findings.flatMap((f) => f.reqIds);
  const quotes = findings
    .map((f) => f.evidence[0]?.quote)
    .filter((q): q is string => Boolean(q));
  if (ids.length > 0) {
    return `${lead}: ${ids.join(", ")}`;
  }
  if (quotes.length > 0) {
    return `${lead}: ${quotes.join("; ")}`;
  }
  return `${lead}: ${findings.map((f) => f.check).join(", ")}`;
}

const MET_REASONING: Record<string, string> = {
  "findings.ids_resolve":
    "Every cited requirement ID resolves in the stated SRS revision",
  "findings.live_coverage":
    "Every live, non-deferred requirement is tested or claimed with a documented rationale",
  "findings.claimed_vs_tested":
    "Claimed coverage matches actual test rows",
  "findings.obsolete_absent":
    "Removed requirement IDs do not reappear as live protocol coverage",
  "findings.applicability_vs_plan":
    "Applicability notes agree with the plan’s configuration codes",
  "findings.one_config_code":
    "Each requirement has one configuration code per plan revision",
  "findings.equipment_listed":
    "Instruments named in methods appear in the equipment table",
  "findings.quantitative_tolerance":
    "Quantitative expected results use an explicit tolerance",
  "findings.normative_language":
    "No non-normative language queued for review",
  "findings.sample_size":
    "Sample size or per-configuration execution is stated",
};

function metReasoning(criterionKey: string, relevant: Finding[]): string {
  const clean = relevant.find((f) => f.disposition === "clean");
  if (clean?.evidence[0]?.quote) return clean.evidence[0].quote;
  return MET_REASONING[criterionKey] ?? "No issues for this criterion";
}
