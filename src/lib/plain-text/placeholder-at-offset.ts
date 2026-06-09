import { collectPlaceholderSpans } from "@/lib/placeholders/find";

export type PlainTextOffsetRange = { from: number; to: number };

/** Placeholder span containing `offset`, or null when cursor is outside placeholders. */
export function placeholderSpanAtOffset(
  text: string,
  offset: number
): PlainTextOffsetRange | null {
  for (const span of collectPlaceholderSpans(text)) {
    if (offset >= span.fromRel && offset <= span.toRel) {
      return { from: span.fromRel, to: span.toRel };
    }
  }
  return null;
}

/** True when `[from, to)` exactly matches one actionable placeholder span. */
export function isExactPlaceholderSelection(
  text: string,
  from: number,
  to: number
): boolean {
  return collectPlaceholderSpans(text).some(
    (span) => span.fromRel === from && span.toRel === to
  );
}
