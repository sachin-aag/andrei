import type { CriterionStatus } from "@/db/schema";
import type { SectionType } from "@/db/schema";
import type { SectionContentMap } from "@/types/sections";
import { collectPlaceholders } from "@/lib/placeholders/scan-sections";

const PLACEHOLDER_CUE =
  /placeholder|to be filled|Placeholders panel|bracket(?:ed)?\s+(?:text|tokens?|placeholders?)/i;

/** Reasoning that only asks the author to fill placeholders (no prose/CAPA gap). */
export function isPlaceholderOnlyEvaluationReasoning(reasoning: string): boolean {
  const text = reasoning.trim();
  if (!text || !PLACEHOLDER_CUE.test(text)) return false;

  const substantiveBeyondPlaceholder =
    /\b(?:missing|omits?|absent|incorrect|unclear|wrong|no (?:evidence|mention|reference)|fails? to|does not (?:state|describe|identify|explain|document)|lack(?:s|ing) (?:of )?(?:a )?|without (?:any )?(?:mention|reference|description)|not (?:stated|described|identified|documented)|collapse[ds]?|ambiguous)\b/i.test(
      text
    );

  if (!substantiveBeyondPlaceholder) return true;

  // "Missing final date" + "complete placeholder" → substantive
  if (
    /\b(?:SOP|CAPA|root cause|batch|equipment|deviation|investigation|notification|5-why|6m)\b/i.test(
      text
    )
  ) {
    return false;
  }

  // Only substantive line is "complete the placeholder(s)"
  return /(?:complete|fill)(?:ing)?\s+(?:the\s+)?placeholders?/i.test(text);
}

export function sectionHasUnfilledPlaceholders(
  sections: Partial<SectionContentMap>,
  section: SectionType
): boolean {
  const content = sections[section];
  if (!content) return false;
  return collectPlaceholders({ [section]: content }).length > 0;
}

/** Unfilled placeholders → at most partially_met; never not_met for placeholder-only gaps. */
export function capEvaluationStatusForPlaceholders(
  status: CriterionStatus,
  reasoning: string,
  hasUnfilledPlaceholders: boolean
): CriterionStatus {
  if (!hasUnfilledPlaceholders || status !== "not_met") return status;
  if (isPlaceholderOnlyEvaluationReasoning(reasoning)) return "partially_met";
  return status;
}

/** Criteria that only need Placeholders panel completion — no Suggest fixes. */
export function shouldSkipSuggestForEvaluation(reasoning: string): boolean {
  return isPlaceholderOnlyEvaluationReasoning(reasoning);
}
