const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "every",
  "for",
  "from",
  "of",
  "on",
  "the",
  "this",
  "to",
  "with",
]);

export type ReviewPagePlanInput = {
  attachmentId: string;
  filename?: string | null;
  transcript?: string | null;
  pageContext?: string | null;
  outlineTitle?: string | null;
  identifiers?: readonly string[] | null;
};

/**
 * Fair-share a page cap across attachments (round-robin) so a
 * lexicographically earlier file cannot consume the entire review.
 */
export function selectReviewPages<T extends { attachmentId: string }>(
  pages: readonly T[],
  cap: number
): T[] {
  if (pages.length <= cap) return [...pages];
  const queues = new Map<string, T[]>();
  const order: string[] = [];
  for (const page of pages) {
    const existing = queues.get(page.attachmentId);
    if (existing) {
      existing.push(page);
      continue;
    }
    order.push(page.attachmentId);
    queues.set(page.attachmentId, [page]);
  }
  const selected: T[] = [];
  while (selected.length < cap) {
    let progressed = false;
    for (const id of order) {
      if (selected.length >= cap) break;
      const queue = queues.get(id);
      if (!queue || queue.length === 0) continue;
      selected.push(queue.shift()!);
      progressed = true;
    }
    if (!progressed) break;
  }
  return selected;
}

export function coverageObjectiveDigest(objective: string): string {
  return objective.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
}

const COVERAGE_OBJECTIVE_MARKER = "|obj:";

/**
 * A finished review keyed to qualification must not unlock an empty
 * calibration (or other inventory) fill. Legacy keys with no `|obj:` digest
 * do not satisfy a specific section.
 */
export function coverageKeySatisfiesObjective(
  coverageKey: string | null | undefined,
  objective: string
): boolean {
  if (!coverageKey) return false;
  const want = coverageObjectiveDigest(objective);
  if (!want) return false;
  const idx = coverageKey.lastIndexOf(COVERAGE_OBJECTIVE_MARKER);
  if (idx === -1) return false;
  const digest = coverageKey.slice(idx + COVERAGE_OBJECTIVE_MARKER.length);
  if (!digest) return false;
  if (digest === want) return true;
  const wantTokens = objectiveTokens(want);
  const haveTokens = objectiveTokens(digest);
  if (wantTokens.length === 0 || haveTokens.length === 0) return false;
  const have = new Set(haveTokens);
  return wantTokens.some((token) => have.has(token));
}

export function objectiveTokens(objective: string): string[] {
  const tokens = coverageObjectiveDigest(objective)
    .replace(/^elr_/, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && token !== "elr" && !STOPWORDS.has(token));
  return [...new Set(tokens)];
}

export function scoreReviewPage(
  page: ReviewPagePlanInput,
  objective: string
): number {
  const tokens = objectiveTokens(objective);
  if (tokens.length === 0) return 0;
  const identifiers = (page.identifiers ?? []).map((id) => id.toLowerCase());
  const haystack = [
    page.outlineTitle ?? "",
    page.pageContext ?? "",
    page.filename ?? "",
    (page.transcript ?? "").slice(0, 800),
  ]
    .join(" ")
    .toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (identifiers.some((id) => id.includes(token) || token.includes(id))) {
      score += 8;
      continue;
    }
    if (haystack.includes(token)) score += 2;
  }
  return score;
}

/** If almost no pages score, pad with fair-shared leftovers up to this floor. */
export const REVIEW_OBJECTIVE_PAGE_FLOOR = 40;

/**
 * Queue pages that match the review objective. Do not pad leftovers up to
 * the listing cap — an objective-filtered finish is complete for that `|obj:`.
 * When almost nothing matches, fill to `REVIEW_OBJECTIVE_PAGE_FLOOR` so a
 * sparse heading still has nearby pages.
 */
export function planReviewPages<T extends ReviewPagePlanInput>(
  pages: readonly T[],
  objective: string,
  cap: number
): T[] {
  if (objectiveTokens(objective).length === 0) {
    return selectReviewPages(pages, cap);
  }
  const relevant: T[] = [];
  const rest: T[] = [];
  for (const page of pages) {
    if (scoreReviewPage(page, objective) > 0) relevant.push(page);
    else rest.push(page);
  }
  const prioritized = selectReviewPages(relevant, cap);
  if (prioritized.length >= REVIEW_OBJECTIVE_PAGE_FLOOR || rest.length === 0) {
    return prioritized;
  }
  const fill = Math.min(
    REVIEW_OBJECTIVE_PAGE_FLOOR - prioritized.length,
    cap - prioritized.length,
    rest.length
  );
  if (fill <= 0) return prioritized;
  return [...prioritized, ...selectReviewPages(rest, fill)];
}
