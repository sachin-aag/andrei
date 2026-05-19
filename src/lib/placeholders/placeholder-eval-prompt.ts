import { collectPlaceholderSpans } from "./find";

/** True when the plain-text prompt includes bracket placeholders. */
export function plainTextHasEvalPlaceholders(text: string): boolean {
  return collectPlaceholderSpans(text).length > 0;
}
