import { iterReportFields } from "./fields";
import { resolveQuoteInFields } from "./locate";
import type { ReviewRunContext } from "./types";

/** Field + anchor for an LLM quote, or null so the card highlights the section. */
export function anchorForQuote(
  ctx: Pick<ReviewRunContext, "documentType" | "sections">,
  section: string,
  quote: string | undefined
): { contentPath: string; anchorText: string } | null {
  if (!quote?.trim()) return null;
  return resolveQuoteInFields(
    iterReportFields(ctx.documentType, ctx.sections),
    section,
    quote
  );
}
