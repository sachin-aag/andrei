import { getDocumentType } from "@/lib/document-types";
import {
  filenameConflictsWithInventoryObjective,
  inventorySectionForObjective,
  isDemotedInventoryFilename,
  isPreferredInventoryFilename,
  pageObjectiveHaystack,
  scoreInventoryReviewPage,
} from "@/lib/ai/chat/inventory-review-schema";
import { phraseFamiliesForReviewObjective } from "@/lib/ai/chat/search-phrase-families";
import {
  isQsrRtmSection,
  isUrsFilename,
  rtmHeadingPhrases,
} from "@/lib/ai/chat/qsr-row-grounding";

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

/**
 * Collapse verbose Table 3 / References walk copy onto the section keys so a
 * later turn that scopes `qsr_qualification_documents` can reuse the finish.
 */
function stableQsrCoverageObjective(normalized: string): string | null {
  if (!normalized) return null;
  if (
    normalized === "qsr_qualification_documents" ||
    normalized.includes("qsr_qualification_documents")
  ) {
    return "qsr_qualification_documents";
  }
  if (
    normalized.includes("qualification document") ||
    normalized.includes("qsr_qualification") ||
    normalized.includes("lifecycle document") ||
    (normalized.includes("table 3") &&
      (normalized.includes("qualification") ||
        normalized.includes("qsr") ||
        normalized.includes("qual doc")))
  ) {
    return "qsr_qualification_documents";
  }
  if (normalized === "qsr_references" || normalized.includes("qsr_references")) {
    return "qsr_references";
  }
  if (
    /\breferences\b/.test(normalized) &&
    (normalized.includes("qsr") || normalized.includes("qualification summary"))
  ) {
    return "qsr_references";
  }
  return null;
}

export function coverageObjectiveDigest(objective: string): string {
  const normalized = objective.trim().toLowerCase().replace(/\s+/g, " ");
  return (stableQsrCoverageObjective(normalized) ?? normalized).slice(0, 80);
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
  const qsrSection = inventorySectionForObjective(objective);
  if (isQsrRtmSection(qsrSection) || qsrSection === "qsr_operating_range") {
    if (isUrsFilename(page.filename)) score += 16;
    for (const phrase of rtmHeadingPhrases(qsrSection)) {
      if (haystack.includes(phrase)) score += 8;
    }
  }
  return score;
}

/**
 * If almost no pages score, keep nearby pages from the same file (or a
 * small fair-share sample when nothing matched). Do not pad 40 leftover
 * pages from other attachments.
 */
export const REVIEW_OBJECTIVE_PAGE_FLOOR = 8;
/**
 * Preferred files with zero scored pages (CCF / CAPA / PRQR on QMS) still
 * join the walk so a few FAT hits cannot skip them — but every page of a
 * 200-page CCF folder is a remaining-section hang (270s abort, no draft).
 * Sample across each file, then fair-share to this cap.
 */
export const REVIEW_PREFERRED_MISSING_PAGE_CAP = 24;
/**
 * ELR inventory walks must finish inside one ~60s continue (8 batches × 6
 * pages at `REVIEW_EXTRACT_CONCURRENCY`) so `finish_document_review` is not
 * truncated and remaining-section still has time to `edit_table` before the
 * 270s abort. Scored CCF / CAPA pages otherwise queue up to the 2500 listing
 * cap. DV catalogs are not inventories — they keep the listing cap.
 */
export const REVIEW_INVENTORY_WALK_CAP = 48;
/**
 * QSR Table 3 / References identity lives on protocol and report covers
 * (document number, revision, status, Protocol No. / Report No.). Walking
 * every IQ/OQ/PQ body page demotes URS and truncates at the ELR 48-page cap.
 */
export const REVIEW_LIFECYCLE_COVER_PAGES_PER_FILE = 2;

function qsrInventorySectionKeys(): readonly string[] {
  return (
    getDocumentType("qualification_summary_report").chat.inventorySections ?? []
  );
}

/**
 * Table 3 (Qualification Documents) and References: covers, not protocol
 * bodies. RTM inventories are not covers — they need URS IDs throughout.
 */
export function isQsrLifecycleCoverObjective(
  objective: string | null | undefined
): boolean {
  if (!objective) return false;
  const digest = coverageObjectiveDigest(objective);
  if (!digest) return false;
  if (
    digest === "qsr_qualification_documents" ||
    digest.includes("qsr_qualification_documents")
  ) {
    return true;
  }
  if (digest === "qsr_references" || digest.includes("qsr_references")) {
    return true;
  }
  if (digest.includes("qualification document")) return true;
  if (digest.includes("lifecycle document")) return true;
  const hasDocIdentity =
    digest.includes("document number") ||
    digest.includes("document no") ||
    digest.includes("document name");
  const hasRevisionOrStatus =
    digest.includes("revision") ||
    digest.includes("status") ||
    digest.includes("effective");
  return hasDocIdentity && hasRevisionOrStatus;
}

function qsrInventorySectionForObjective(
  objective: string | null | undefined
): string | null {
  if (!objective) return null;
  const digest = coverageObjectiveDigest(objective);
  if (!digest) return null;
  const keys = qsrInventorySectionKeys();
  if (keys.includes(digest)) return digest;
  if (
    digest.includes("qualification document") ||
    digest.includes("qsr_qualification") ||
    digest.includes("lifecycle document")
  ) {
    return "qsr_qualification_documents";
  }
  for (const key of keys) {
    if (key === "qsr_qualification_documents") continue;
    const noun = key.replace(/^qsr_/, "").replace(/_/g, " ");
    if (noun.length >= 4 && digest.includes(noun)) return key;
  }
  return null;
}

export function isQsrInventoryReviewObjective(
  ...objectives: Array<string | null | undefined>
): boolean {
  return objectives.some((objective) =>
    Boolean(qsrInventorySectionForObjective(objective))
  );
}

function coverPagesPerAttachment<T extends ReviewPagePlanInput>(
  pages: readonly T[],
  perFile: number,
  cap: number
): T[] {
  if (pages.length === 0 || perFile <= 0 || cap <= 0) return [];
  const byAttachment = new Map<string, T[]>();
  const order: string[] = [];
  for (const page of pages) {
    const existing = byAttachment.get(page.attachmentId);
    if (existing) {
      existing.push(page);
      continue;
    }
    order.push(page.attachmentId);
    byAttachment.set(page.attachmentId, [page]);
  }
  const selected: T[] = [];
  for (const id of order) {
    if (selected.length >= cap) break;
    const siblings = [...(byAttachment.get(id) ?? [])].sort((a, b) => {
      const aNo =
        typeof a.pageNumber === "number" && Number.isFinite(a.pageNumber)
          ? a.pageNumber
          : Number.MAX_SAFE_INTEGER;
      const bNo =
        typeof b.pageNumber === "number" && Number.isFinite(b.pageNumber)
          ? b.pageNumber
          : Number.MAX_SAFE_INTEGER;
      return aNo - bNo;
    });
    const take = Math.min(perFile, siblings.length, cap - selected.length);
    selected.push(...siblings.slice(0, take));
  }
  return selected;
}

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
 * Spread a sample through one attachment so a nested QMS / CAPA chapter
 * is not missed by taking only the cover pages.
 */
export function samplePagesAcrossAttachment<T>(
  pages: readonly T[],
  limit: number
): T[] {
  if (limit <= 0 || pages.length === 0) return [];
  if (pages.length <= limit) return [...pages];
  if (limit === 1) return [pages[0]!];
  const out: T[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < limit; i++) {
    const idx = Math.round((i * (pages.length - 1)) / (limit - 1));
    if (seen.has(idx)) continue;
    seen.add(idx);
    out.push(pages[idx]!);
  }
  for (let idx = 0; idx < pages.length && out.length < limit; idx++) {
    if (seen.has(idx)) continue;
    seen.add(idx);
    out.push(pages[idx]!);
  }
  return out;
}

/**
 * Preferred inventory files (PRQR / PMC / CCF) that had zero scored
 * pages. A few CSV-IQ / FAT hits must not skip those files — that is the
 * remaining-section hang (floor-8 pad, then truncated finish cannot unlock).
 */
function preferredPagesMissingFromHits<T extends ReviewPagePlanInput>(
  pages: readonly T[],
  hits: readonly T[],
  objective: string
): T[] {
  const section = inventorySectionForObjective(objective);
  if (!section) return [];
  const hitPreferredIds = new Set<string>();
  for (const page of hits) {
    if (isPreferredInventoryFilename(page.filename, section)) {
      hitPreferredIds.add(page.attachmentId);
    }
  }
  return pages.filter(
    (page) =>
      isPreferredInventoryFilename(page.filename, section) &&
      !hitPreferredIds.has(page.attachmentId) &&
      !filenameConflictsWithInventoryObjective(page.filename, objective)
  );
}

function samplePagesAcrossAttachments<T extends ReviewPagePlanInput>(
  pages: readonly T[],
  cap: number,
  perFileLimit?: number
): T[] {
  if (pages.length === 0 || cap <= 0) return [];
  const byAttachment = new Map<string, T[]>();
  const order: string[] = [];
  for (const page of pages) {
    const existing = byAttachment.get(page.attachmentId);
    if (existing) {
      existing.push(page);
      continue;
    }
    order.push(page.attachmentId);
    byAttachment.set(page.attachmentId, [page]);
  }
  const perFile = Math.max(
    1,
    Math.min(perFileLimit ?? cap, Math.ceil(cap / order.length))
  );
  const sampled: T[] = [];
  for (const id of order) {
    sampled.push(
      ...samplePagesAcrossAttachment(byAttachment.get(id) ?? [], perFile)
    );
  }
  return selectReviewPages(sampled, cap);
}

function samplePreferredMissingPages<T extends ReviewPagePlanInput>(
  pages: readonly T[],
  cap: number
): T[] {
  return samplePagesAcrossAttachments(
    pages,
    cap,
    REVIEW_OBJECTIVE_PAGE_FLOOR
  );
}

/**
 * Stratified sample of an ELR inventory queue so scored CCF pages cannot
 * consume the 2500 listing cap. No-op for DV / non-inventory objectives,
 * and when the matching set already fits in one continue.
 */
function capInventoryReviewPages<T extends ReviewPagePlanInput>(
  pages: readonly T[],
  objective: string,
  cap: number
): T[] {
  if (!inventorySectionForObjective(objective)) return [...pages];
  const walkCap = Math.min(REVIEW_INVENTORY_WALK_CAP, cap);
  if (pages.length <= walkCap) return [...pages];
  return samplePagesAcrossAttachments(pages, walkCap);
}

function withNeighborFill<T extends ReviewPagePlanInput>(
  prioritized: T[],
  pages: readonly T[],
  cap: number
): T[] {
  if (prioritized.length >= REVIEW_OBJECTIVE_PAGE_FLOOR) return prioritized;
  const fill = Math.min(
    REVIEW_OBJECTIVE_PAGE_FLOOR - prioritized.length,
    cap - prioritized.length
  );
  if (fill <= 0) return prioritized;
  return [...prioritized, ...neighborFillPages(pages, prioritized, fill)];
}

/**
 * Queue pages that match the review objective. Do not pad leftovers up to
 * the listing cap — an objective-filtered finish is complete for that `|obj:`.
 * When few pages score, keep nearby pages in the same file up to
 * `REVIEW_OBJECTIVE_PAGE_FLOOR`. When nothing scores, take that many
 * fair-shared pages so the walk is not empty. Preferred inventory files
 * with zero hits are still queued as a stratified sample (not every page
 * of a 200-page CCF / PRQR, up to `REVIEW_PREFERRED_MISSING_PAGE_CAP`).
 * Scored inventory pages are then capped at `REVIEW_INVENTORY_WALK_CAP`
 * (DV catalogs are not). QSR Table 3 / References take the first
 * `REVIEW_LIFECYCLE_COVER_PAGES_PER_FILE` pages of each file.
 */
export function planReviewPages<T extends ReviewPagePlanInput>(
  pages: readonly T[],
  objective: string,
  cap: number
): T[] {
  if (isQsrLifecycleCoverObjective(objective)) {
    return coverPagesPerAttachment(
      pages,
      REVIEW_LIFECYCLE_COVER_PAGES_PER_FILE,
      cap
    );
  }
  if (
    objectiveTokens(objective).length === 0 &&
    phraseFamiliesForReviewObjective(objective).length === 0 &&
    inventorySectionForObjective(objective) === null
  ) {
    return selectReviewPages(pages, cap);
  }
  const relevant: T[] = [];
  for (const page of pages) {
    if (
      scoreReviewPage(page, objective) > 0 &&
      !filenameConflictsWithInventoryObjective(page.filename, objective)
    ) {
      relevant.push(page);
    }
  }
  const preferredMissing = preferredPagesMissingFromHits(
    pages,
    relevant,
    objective
  );
  if (relevant.length === 0) {
    if (preferredMissing.length > 0) {
      return capInventoryReviewPages(
        samplePreferredMissingPages(
          preferredMissing,
          Math.min(REVIEW_OBJECTIVE_PAGE_FLOOR, cap)
        ),
        objective,
        cap
      );
    }
    const withoutForeignInventory = pages.filter(
      (page) =>
        !filenameConflictsWithInventoryObjective(page.filename, objective)
    );
    let pool =
      withoutForeignInventory.length > 0 ? withoutForeignInventory : pages;
    const section = inventorySectionForObjective(objective);
    if (section && !isQsrRtmSection(section) && section !== "qsr_operating_range") {
      const notDemoted = pool.filter(
        (page) => !isDemotedInventoryFilename(page.filename)
      );
      if (notDemoted.length > 0) pool = notDemoted;
    }
    return capInventoryReviewPages(
      selectReviewPages(pool, Math.min(REVIEW_OBJECTIVE_PAGE_FLOOR, cap)),
      objective,
      cap
    );
  }
  const preferredSample = samplePreferredMissingPages(
    preferredMissing,
    Math.min(REVIEW_PREFERRED_MISSING_PAGE_CAP, cap)
  );
  const candidate =
    preferredSample.length > 0 ? [...relevant, ...preferredSample] : relevant;
  return capInventoryReviewPages(
    withNeighborFill(selectReviewPages(candidate, cap), pages, cap),
    objective,
    cap
  );
}
