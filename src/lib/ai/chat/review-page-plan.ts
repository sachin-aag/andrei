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

/**
 * Prefer pages that match the review objective, then fair-share the rest
 * so one file cannot consume the safety cap.
 */
export function planReviewPages<T extends ReviewPagePlanInput>(
  pages: readonly T[],
  objective: string,
  cap: number
): T[] {
  if (pages.length <= cap && objectiveTokens(objective).length === 0) {
    return [...pages];
  }
  const relevant: T[] = [];
  const rest: T[] = [];
  for (const page of pages) {
    if (scoreReviewPage(page, objective) > 0) relevant.push(page);
    else rest.push(page);
  }
  if (pages.length <= cap) {
    return [...relevant, ...rest];
  }
  const prioritized = selectReviewPages(relevant, cap);
  if (prioritized.length >= cap) return prioritized;
  return [
    ...prioritized,
    ...selectReviewPages(rest, cap - prioritized.length),
  ];
}
