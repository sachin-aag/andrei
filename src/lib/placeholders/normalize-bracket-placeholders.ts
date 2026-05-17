import { NUMERIC_ONLY_BRACKET } from "./find";

/**
 * Makes bracket placeholders consistent with `[Label: <to be filled>]` when AI
 * omits `<to be filled>` (for example `[number]`).
 *
 * - Skips citation-style `[digits]`.
 * - Skips spans that already mention `to be filled` with or without angle brackets.
 */
export function normalizeBracketPlaceholdersInPlainText(text: string): string {
  return text.replace(/\[[^\]]+\]/g, (match) => {
    if (NUMERIC_ONLY_BRACKET.test(match)) return match;
    if (/to\s+be\s+filled/i.test(match)) return match;

    const inner = match.slice(1, -1).trimEnd();
    if (!inner) return match;

    return `[${inner}: <to be filled>]`;
  });
}
