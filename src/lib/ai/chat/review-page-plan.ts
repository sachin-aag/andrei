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
  QSR_RTM_SECTIONS,
  rtmHeadingPhrases,
} from "@/lib/ai/chat/qsr-row-grounding";
import {
  QSR_TABLE_HEADERS,
  QSR_TABLE_SECTION_KEYS,
  type QsrTableSectionKey,
} from "@/lib/document-types/qsr/sections";
import { detectSectionIntentsFromText } from "@/lib/ai/chat/section-intent";

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

/** QSR-specific RTM headings. Do not use bare "user requirement" — that is every URS. */
const QSR_RTM_OBJECTIVE_PHRASES = [
  "control philosophy",
  "process requirements",
  "gmp requirements",
  "safety requirements",
  "computer system validation",
  "maintenance and cleaning",
  "requirement traceability",
] as const;

export type QsrReviewPagePlan = "cover" | "urs" | "scored" | "mixed";

const QSR_COVER_SECTIONS = new Set<string>([
  "qsr_qualification_documents",
]);

const QSR_URS_SECTIONS = new Set<string>([
  ...QSR_RTM_SECTIONS,
  "qsr_operating_range",
  "qsr_rtm",
  "qsr_references",
]);

function pagePlanForQsrSection(section: string): Exclude<QsrReviewPagePlan, "mixed"> {
  if (QSR_COVER_SECTIONS.has(section)) return "cover";
  if (QSR_URS_SECTIONS.has(section) || isQsrRtmSection(section)) return "urs";
  return "scored";
}

function isUniqueIdentityHeader(header: string): boolean {
  const needle = header.toLowerCase().replace(/\s+/g, " ").trim();
  if (needle === "urs id") return true;
  if (/\b(?:s\.?\s*no|serial|sr\.?\s*no)\b/.test(needle)) return false;
  return (
    /\b(?:document|sop|reference|protocol|report)\s+(?:number|no\.?)\b/.test(
      needle
    ) ||
    (/\b(?:number|no\.?)\b/.test(needle) &&
      /\b(?:document|sop|reference|protocol|report)\b/.test(needle))
  );
}

function addQualDocIdentity(normalized: string, found: Set<string>): void {
  if (
    normalized === "qsr_qualification_documents" ||
    normalized.includes("qsr_qualification_documents") ||
    normalized.includes("qualification document") ||
    normalized.includes("qsr_qualification") ||
    normalized.includes("lifecycle document")
  ) {
    found.add("qsr_qualification_documents");
  }
}

function addSopIdentity(normalized: string, found: Set<string>): void {
  if (
    normalized === "qsr_sops" ||
    normalized.includes("qsr_sops")
  ) {
    found.add("qsr_sops");
  }
}

function addReferencesIdentity(normalized: string, found: Set<string>): void {
  if (
    normalized === "qsr_references" ||
    normalized.includes("qsr_references") ||
    /\b1\.3\b/.test(normalized)
  ) {
    found.add("qsr_references");
    return;
  }
  if (
    /\breferences\b/.test(normalized) &&
    (normalized.includes("qsr") || normalized.includes("qualification summary"))
  ) {
    found.add("qsr_references");
  }
}

function addRtmIdentity(normalized: string, found: Set<string>): void {
  if (
    normalized === "qsr_rtm" ||
    /^qsr_rtm_/.test(normalized) ||
    normalized.includes("qsr_rtm_")
  ) {
    found.add("qsr_rtm");
    return;
  }
  if (QSR_RTM_OBJECTIVE_PHRASES.some((phrase) => normalized.includes(phrase))) {
    found.add("qsr_rtm");
  }
}

/**
 * Every QSR identity named in a review objective. Used to refuse collapsing
 * mixed page plans (cover vs URS vs scored body) onto a single `|obj:` key.
 */
export function qsrIdentitiesInObjective(
  objective: string | null | undefined
): string[] {
  const normalized = (objective ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return [];
  const found = new Set<string>();

  for (const key of QSR_TABLE_SECTION_KEYS) {
    if (normalized === key || normalized.includes(key)) found.add(key);
  }
  addQualDocIdentity(normalized, found);
  addSopIdentity(normalized, found);
  addReferencesIdentity(normalized, found);
  addRtmIdentity(normalized, found);

  for (const [section, headers] of Object.entries(QSR_TABLE_HEADERS) as Array<
    [QsrTableSectionKey, readonly string[]]
  >) {
    for (const header of headers) {
      if (!isUniqueIdentityHeader(header)) continue;
      if (normalized.includes(header.toLowerCase())) found.add(section);
    }
  }

  for (const section of detectSectionIntentsFromText(
    objective ?? "",
    "qualification_summary_report"
  )) {
    if (
      (QSR_TABLE_SECTION_KEYS as readonly string[]).includes(section) ||
      QSR_COVER_SECTIONS.has(section) ||
      QSR_URS_SECTIONS.has(section)
    ) {
      found.add(section);
    }
  }

  return [...found];
}

function isBareCoverIdentity(normalized: string): boolean {
  const hasDocIdentity =
    normalized.includes("document number") ||
    normalized.includes("document no") ||
    normalized.includes("document name");
  const hasRevisionOrStatus =
    normalized.includes("revision") ||
    normalized.includes("status") ||
    normalized.includes("effective");
  return hasDocIdentity && hasRevisionOrStatus;
}

/**
 * How this objective should queue pages. Collapse `|obj:` only when every
 * named identity shares a plan — a mixed "draft 3 and 4" must not become a
 * Table 3 cover walk.
 */
export function qsrReviewPagePlan(
  objective: string | null | undefined
): QsrReviewPagePlan {
  const normalized = (objective ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return "scored";
  const identities = qsrIdentitiesInObjective(objective);
  const plans = new Set(identities.map((section) => pagePlanForQsrSection(section)));
  if (plans.size > 1) return "mixed";
  if (plans.size === 1) return [...plans][0]!;
  if (isBareCoverIdentity(normalized) && identities.length === 0) return "cover";
  return "scored";
}

/**
 * Collapse verbose Table 3 / References / RTM walk copy onto the section
 * keys so a later turn that scopes the same identity can reuse the finish.
 * Do not collapse when the named identities need different page plans.
 */
function stableQsrCoverageObjective(normalized: string): string | null {
  if (!normalized) return null;
  if (qsrReviewPagePlan(normalized) === "mixed") return null;

  const identities = qsrIdentitiesInObjective(normalized);
  const rtmNamed = identities.some(
    (id) => id === "qsr_rtm" || isQsrRtmSection(id) || id === "qsr_operating_range"
  );
  const coverNamed = identities.filter((id) => QSR_COVER_SECTIONS.has(id));
  const plans = new Set(identities.map((section) => pagePlanForQsrSection(section)));

  if (plans.size === 1 && plans.has("urs") && rtmNamed) {
    if (
      identities.length === 1 &&
      identities[0] === "qsr_operating_range"
    ) {
      return "qsr_operating_range";
    }
    return "qsr_rtm";
  }
  if (plans.size === 1 && plans.has("cover") && coverNamed.length > 0) {
    return coverNamed.includes("qsr_qualification_documents")
      ? "qsr_qualification_documents"
      : coverNamed[0]!;
  }
  if (identities.length === 1) return identities[0]!;
  if (QSR_RTM_OBJECTIVE_PHRASES.some((phrase) => normalized.includes(phrase))) {
    return "qsr_rtm";
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
  // NL RTM copy ("control philosophy") collapses to qsr_rtm; do not
  // tokenize the collapsed family or `qsr` leaks onto Table 3.
  if (coverageObjectiveDigest(digest) === want) return true;
  // A mixed-plan finish (Table 3 covers + SOP body) must not unlock a
  // later single-identity walk via overlapping tokens.
  if (
    qsrReviewPagePlan(digest) === "mixed" &&
    qsrReviewPagePlan(objective) !== "mixed"
  ) {
    return false;
  }
  const wantTokens = objectiveTokens(objective);
  const haveTokens = objectiveTokens(digest);
  if (wantTokens.length === 0 || haveTokens.length === 0) return false;
  const have = new Set(haveTokens);
  return wantTokens.some((token) => have.has(token));
}

export function objectiveTokens(objective: string): string[] {
  const tokens = objective
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
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
 * QSR Table 3 identity lives on protocol and report covers (document
 * number, revision, status, Protocol No. / Report No.). Walking every
 * IQ/OQ/PQ body page demotes URS and truncates at the ELR 48-page cap.
 * 1.3 References is not a cover walk — PO / design spec / ISPE live in
 * the URS.
 */
export const REVIEW_LIFECYCLE_COVER_PAGES_PER_FILE = 2;

function qsrInventorySectionKeys(): readonly string[] {
  return (
    getDocumentType("qualification_summary_report").chat.inventorySections ?? []
  );
}

/**
 * Table 3 (Qualification Documents): covers, not protocol bodies.
 * References is a URS walk (the list including PO / data sheet lives
 * in URS §1.3). RTM inventories are not covers — they need URS IDs
 * throughout. Mixed identities that also need body pages are not a
 * cover walk.
 */
export function isQsrLifecycleCoverObjective(
  objective: string | null | undefined
): boolean {
  if (!objective) return false;
  return qsrReviewPagePlan(objective) === "cover";
}

function qsrInventorySectionForObjective(
  objective: string | null | undefined
): string | null {
  if (!objective) return null;
  const digest = coverageObjectiveDigest(objective);
  if (!digest) return null;
  const keys = qsrInventorySectionKeys();
  if (digest === "qsr_rtm") return "qsr_rtm_process";
  if (digest === "qsr_operating_range" || digest.includes("operating range")) {
    return "qsr_operating_range";
  }
  if (digest === "qsr_references" || digest.includes("qsr_references")) {
    return "qsr_references";
  }
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
    if (isQsrRtmSection(key)) {
      if (rtmHeadingPhrases(key).some((phrase) => digest.includes(phrase))) {
        return key;
      }
    }
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

/**
 * QSR RTM / Operating Range / 1.3 References evidence lives in the URS,
 * not DQ/IQ/OQ/PQ protocol bodies. Table 3 stays a cover-page walk of
 * every lifecycle file.
 */
export function isQsrUrsWalkObjective(
  ...objectives: Array<string | null | undefined>
): boolean {
  return objectives.some(
    (objective) => Boolean(objective) && qsrReviewPagePlan(objective) === "urs"
  );
}

/** Ready files to page-list for a QSR inventory walk. */
export function qsrInventoryReadyIdsForObjective<
  T extends { attachmentId: string; filename?: string | null },
>(
  ready: readonly T[],
  coverageObjective: string | null | undefined,
  toolObjective: string | null | undefined
): string[] {
  if (
    isQsrLifecycleCoverObjective(coverageObjective) ||
    isQsrLifecycleCoverObjective(toolObjective)
  ) {
    return ready.map((doc) => doc.attachmentId);
  }
  if (isQsrUrsWalkObjective(coverageObjective, toolObjective)) {
    const urs = ready.filter((doc) => isUrsFilename(doc.filename));
    return (urs.length > 0 ? urs : ready).map((doc) => doc.attachmentId);
  }
  return ready.map((doc) => doc.attachmentId);
}

function pagesForQsrUrsWalk<T extends ReviewPagePlanInput>(
  pages: readonly T[],
  objective: string
): readonly T[] {
  if (!isQsrUrsWalkObjective(objective)) return pages;
  const urs = pages.filter((page) => isUrsFilename(page.filename));
  return urs.length > 0 ? urs : pages;
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
 * (DV catalogs are not). QSR Table 3 takes the first
 * `REVIEW_LIFECYCLE_COVER_PAGES_PER_FILE` pages of each file. QSR RTM /
 * Operating Range / 1.3 References keep the URS when one is attached —
 * not protocol bodies.
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
  const scopedPages = pagesForQsrUrsWalk(pages, objective);
  if (
    objectiveTokens(objective).length === 0 &&
    phraseFamiliesForReviewObjective(objective).length === 0 &&
    inventorySectionForObjective(objective) === null
  ) {
    return selectReviewPages(scopedPages, cap);
  }
  const relevant: T[] = [];
  for (const page of scopedPages) {
    if (
      scoreReviewPage(page, objective) > 0 &&
      !filenameConflictsWithInventoryObjective(page.filename, objective)
    ) {
      relevant.push(page);
    }
  }
  const preferredMissing = preferredPagesMissingFromHits(
    scopedPages,
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
    const withoutForeignInventory = scopedPages.filter(
      (page) =>
        !filenameConflictsWithInventoryObjective(page.filename, objective)
    );
    let pool =
      withoutForeignInventory.length > 0
        ? withoutForeignInventory
        : scopedPages;
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
    withNeighborFill(selectReviewPages(candidate, cap), scopedPages, cap),
    objective,
    cap
  );
}
