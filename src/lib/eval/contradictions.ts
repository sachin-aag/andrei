export type ContradictionRule = {
  /** Match this in the source (usually table text). */
  when: RegExp;
  /** Fail when this also matches the target (usually narrative). */
  contradicts: RegExp;
  message: string;
};

/**
 * Directed contradiction: a fact in `source` that the `target` text denies.
 * Tenant-general — pass document-type rules at the call site.
 */
export function findDirectedContradictions(
  source: string,
  target: string,
  rules: readonly ContradictionRule[]
): string[] {
  if (!source.trim() || !target.trim()) return [];
  const hits: string[] = [];
  for (const rule of rules) {
    if (rule.when.test(source) && rule.contradicts.test(target)) {
      hits.push(rule.message);
    }
  }
  return hits;
}
