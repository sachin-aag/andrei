import { extractHardFacts } from "@/lib/ai/chat/claim-facts";
import { stripTrailingCitationBlockFromText } from "@/lib/suggestions/citations-at-end";
import { iterReportFields } from "../fields";
import type { ReviewCheckResult, ReviewFindingDraft, ReviewRunContext } from "../types";

export function uncitedFactFindings(
  ctx: Pick<ReviewRunContext, "documentType" | "sections">
): ReviewFindingDraft[] {
  const findings: ReviewFindingDraft[] = [];
  for (const field of iterReportFields(ctx.documentType, ctx.sections)) {
    const body = stripTrailingCitationBlockFromText(field.text);
    for (const fact of extractHardFacts(body)) {
      if (fact.cited.length > 0) continue;
      findings.push({
        section: field.section,
        contentPath: field.contentPath,
        anchorText: fact.text,
        message: `Uncited ${fact.kind}: “${fact.text}”. Please add a citation or confirm it is not an attachment fact.`,
        severity: "major",
        kind: "needs_human",
        metadata: { factKind: fact.kind },
      });
    }
  }
  return findings;
}

export async function runUncitedFactsCheck(
  ctx: ReviewRunContext
): Promise<ReviewCheckResult> {
  return { findings: uncitedFactFindings(ctx) };
}
