/** Distinct Results-tab titles when the same column is analyzed more than once. */
export function nextAnalysisTitle(
  existingTitles: readonly string[],
  base: string
): string {
  const trimmed = base.trim() || "Analysis";
  const used = new Set(existingTitles);
  if (!used.has(trimmed)) return trimmed;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${trimmed} (${n})`;
    if (!used.has(candidate)) return candidate;
  }
  return `${trimmed} (${Date.now()})`;
}

/** Title for in-place analysis edits — skips collision with the row being updated. */
export function titleForUpdate(
  existingTitles: readonly string[],
  currentTitle: string,
  requested: string | undefined,
  fallback: string
): string {
  const base = requested?.trim() || fallback.trim() || currentTitle.trim() || "Analysis";
  if (base === currentTitle) return currentTitle;
  const otherTitles = existingTitles.filter((title) => title !== currentTitle);
  return nextAnalysisTitle(otherTitles, base);
}
