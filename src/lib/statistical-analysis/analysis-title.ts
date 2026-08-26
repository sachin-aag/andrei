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
