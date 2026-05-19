/**
 * Text normalization helpers for layered anchor matching in Tiptap JSON and plain text.
 */

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** NFC + common Word/smart punctuation → ASCII-ish equivalents for matching. */
export function normalizeUnicodeForAnchor(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

export type AnchorMatchLayer = "exact" | "collapsed" | "normalized";

export type AnchorMatch = {
  layer: AnchorMatchLayer;
  start: number;
  end: number;
};

/**
 * Find `needle` in `haystack` using exact → collapsed-whitespace → Unicode-normalized layers.
 * Returns start/end indices in the original `haystack` string (exact layer only for indices;
 * collapsed/normalized map back via re-search on original when possible).
 */
export function findAnchorInText(haystack: string, needle: string): AnchorMatch | null {
  const trimmedNeedle = needle.trim();
  if (!trimmedNeedle) return null;

  const exactIdx = haystack.indexOf(trimmedNeedle);
  if (exactIdx !== -1) {
    return { layer: "exact", start: exactIdx, end: exactIdx + trimmedNeedle.length };
  }

  const collapsedHay = collapseWhitespace(haystack);
  const collapsedNeedle = collapseWhitespace(trimmedNeedle);
  const collapsedIdx = collapsedHay.indexOf(collapsedNeedle);
  if (collapsedIdx !== -1) {
    const mapped = mapCollapsedIndexToOriginal(haystack, collapsedIdx, collapsedNeedle.length);
    if (mapped) return { layer: "collapsed", ...mapped };
  }

  const normHay = normalizeUnicodeForAnchor(haystack);
  const normNeedle = normalizeUnicodeForAnchor(trimmedNeedle);
  const normIdx = normHay.indexOf(normNeedle);
  if (normIdx !== -1) {
    const mapped = mapCollapsedIndexToOriginal(haystack, normIdx, normNeedle.length);
    if (mapped) return { layer: "normalized", ...mapped };
  }

  return null;
}

/** Map a match in collapsed/normalized space back to an approximate span in the original string. */
function mapCollapsedIndexToOriginal(
  original: string,
  collapsedStart: number,
  collapsedLen: number
): { start: number; end: number } | null {
  const collapsed = collapseWhitespace(original);
  const slice = collapsed.slice(collapsedStart, collapsedStart + collapsedLen);
  if (!slice) return null;

  // Re-locate slice in original with whitespace tolerance.
  const pattern = slice.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const re = new RegExp(pattern);
  const m = re.exec(original);
  if (!m) return null;
  return { start: m.index, end: m.index + m[0].length };
}

export function countOccurrences(haystack: string, needle: string): number {
  const match = findAnchorInText(haystack, needle);
  if (!match) return 0;
  // Ambiguity check: count collapsed occurrences.
  const collapsedHay = collapseWhitespace(haystack);
  const collapsedNeedle = collapseWhitespace(needle.trim());
  if (!collapsedNeedle) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    const found = collapsedHay.indexOf(collapsedNeedle, idx);
    if (found === -1) break;
    count++;
    idx = found + 1;
  }
  return count;
}
