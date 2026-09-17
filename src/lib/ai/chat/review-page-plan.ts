import {
  filenameConflictsWithInventoryObjective,
  inventorySectionForObjective,
  pageObjectiveHaystack,
  scoreInventoryReviewPage,
} from "@/lib/ai/chat/inventory-review-schema";
import { phraseFamiliesForReviewObjective } from "@/lib/ai/chat/search-phrase-families";

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
  pageNumber?: number | null;
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
  const inventoryScore = scoreInventoryReviewPage(page, objective);
  if (inventoryScore !== null) return inventoryScore;
  const tokens = objectiveTokens(objective);
  const familyTerms = phraseFamiliesForReviewObjective(objective).flatMap(
    (family) => [...family]
  );
  if (tokens.length === 0 && familyTerms.length === 0) return 0;
  const identifiers = (page.identifiers ?? []).map((id) => id.toLowerCase());
  const haystack = pageObjectiveHaystack(page);
  let score = 0;
  for (const term of familyTerms) {
    const needle = term.toLowerCase();
    if (needle.length >= 3 && haystack.includes(needle)) score += 4;
  }
  for (const token of tokens) {
    if (identifiers.some((id) => id.includes(token) || token.includes(id))) {
      score += 8;
      continue;
    }
    if (familyTerms.length === 0 && haystack.includes(token)) score += 2;
  }
  return score;
}

/**
 * If almost no pages score, keep nearby pages from the same file (or a
 * small fair-share sample when nothing matched). Do not pad 40 leftover
 * pages from other attachments.
 */
export const REVIEW_OBJECTIVE_PAGE_FLOOR = 8;

function pageOrdinal<T extends ReviewPagePlanInput>(
  page: T,
  indexInAttachment: number
): number {
  return typeof page.pageNumber === "number" && Number.isFinite(page.pageNumber)
    ? page.pageNumber
    : indexInAttachment;
}

/**
 * Same-attachment pages closest to scored hits (page ±1, then ±2, …).
 * Does not pull unrelated files.
 */
export function neighborFillPages<T extends ReviewPagePlanInput>(
  all: readonly T[],
  hits: readonly T[],
  fill: number
): T[] {
  if (fill <= 0 || hits.length === 0) return [];
  const hitSet = new Set<T>(hits);
  const byAttachment = new Map<string, T[]>();
  for (const page of all) {
    const existing = byAttachment.get(page.attachmentId);
    if (existing) {
      existing.push(page);
      continue;
    }
    byAttachment.set(page.attachmentId, [page]);
  }

  const ranked: { dist: number; page: T }[] = [];
  for (const hit of hits) {
    const siblings = byAttachment.get(hit.attachmentId) ?? [];
    const hitAt = siblings.indexOf(hit);
    const hitNo = pageOrdinal(hit, hitAt);
    for (const [sibAt, sib] of siblings.entries()) {
      if (hitSet.has(sib)) continue;
      ranked.push({
        dist: Math.abs(pageOrdinal(sib, sibAt) - hitNo),
        page: sib,
      });
    }
  }
  ranked.sort((a, b) => a.dist - b.dist);
  const out: T[] = [];
  const seen = new Set<T>(hits);
  for (const row of ranked) {
    if (seen.has(row.page)) continue;
    seen.add(row.page);
    out.push(row.page);
    if (out.length >= fill) break;
  }
  return out;
}

/**
 * Queue pages that match the review objective. Do not pad leftovers up to
 * the listing cap — an objective-filtered finish is complete for that `|obj:`.
 * When few pages score, keep nearby pages in the same file up to
 * `REVIEW_OBJECTIVE_PAGE_FLOOR`. When nothing scores, take that many
 * fair-shared pages so the walk is not empty.
 */
export function planReviewPages<T extends ReviewPagePlanInput>(
  pages: readonly T[],
  objective: string,
  cap: number
): T[] {
  if (
    objectiveTokens(objective).length === 0 &&
    phraseFamiliesForReviewObjective(objective).length === 0 &&
    inventorySectionForObjective(objective) === null
  ) {
    return selectReviewPages(pages, cap);
  }
  const relevant: T[] = [];
  for (const page of pages) {
    if (scoreReviewPage(page, objective) > 0) relevant.push(page);
  }
  if (relevant.length === 0) {
    const withoutForeignInventory = pages.filter(
      (page) =>
        !filenameConflictsWithInventoryObjective(page.filename, objective)
    );
    const pool =
      withoutForeignInventory.length > 0 ? withoutForeignInventory : pages;
    return selectReviewPages(pool, Math.min(REVIEW_OBJECTIVE_PAGE_FLOOR, cap));
  }
  const prioritized = selectReviewPages(relevant, cap);
  if (prioritized.length >= REVIEW_OBJECTIVE_PAGE_FLOOR) {
    return prioritized;
  }
  const fill = Math.min(
    REVIEW_OBJECTIVE_PAGE_FLOOR - prioritized.length,
    cap - prioritized.length
  );
  if (fill <= 0) return prioritized;
  return [...prioritized, ...neighborFillPages(pages, prioritized, fill)];
}
