import {
  isNumericCitationMarker,
  isSourceCitationBracket,
} from "@/lib/placeholders/citation-bracket";

/**
 * True when a table cell already names a source (`[filename, p. N]`,
 * `[filename]`, or a parked numeric `[n]` marker). Empty cells are not
 * required to carry a citation — callers skip those separately.
 */
export function textHasSourceCitation(text: string): boolean {
  const matches = text.match(/\[[^\]]+\]/g);
  if (!matches) return false;
  return matches.some(
    (match) => isSourceCitationBracket(match) || isNumericCitationMarker(match)
  );
}
