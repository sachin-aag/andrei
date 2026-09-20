/**
 * Split tables that print "Page N of M" (SOP annexures, privilege matrices).
 * The next PDF page is the rest of the table — serve it with the read, and
 * do not treat the first page as a complete cited source.
 */

const PAGE_OF_RE = /\bpage\s+(\d{1,4})\s+of\s+(\d{1,4})\b/i;
const CONTINUED_RE =
  /\bcont(?:inued|\.?\s*d\.?)\s+(?:on\s+)?(?:the\s+)?next\s+page\b/i;

export const PAGE_CONTINUATION_SEARCH_HINT =
  "Hits with continues=true are a split table (Page N of M). Read nextPage (or the included continuation) and copy every Sr. row from both pages before edit_table.";

export type PageOfTotal = {
  page: number;
  total: number;
};

export type ContinuationPageInput = {
  pageNumber: number;
  transcript?: string | null;
  visualInterpretation?: string | null;
  pageContext?: string | null;
  printedPageLabel?: string | null;
  quote?: string | null;
  text?: string | null;
  heading?: string | null;
  summary?: string | null;
};

export function pageContinuationHaystack(input: {
  transcript?: string | null;
  visualInterpretation?: string | null;
  pageContext?: string | null;
  printedPageLabel?: string | null;
  quote?: string | null;
  text?: string | null;
  heading?: string | null;
  summary?: string | null;
}): string {
  return [
    input.transcript,
    input.visualInterpretation,
    input.pageContext,
    input.printedPageLabel,
    input.quote,
    input.text,
    input.heading,
    input.summary,
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n");
}

export function parsePageOfTotal(text: string): PageOfTotal | null {
  const match = text.match(PAGE_OF_RE);
  if (!match) return null;
  const page = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(page) || !Number.isInteger(total)) return null;
  if (page < 1 || total < 1 || page > total) return null;
  return { page, total };
}

/** Next PDF page when this page is not the last of a printed Page N of M set. */
export function continuationPageNumber(
  input: ContinuationPageInput
): number | null {
  if (!Number.isInteger(input.pageNumber) || input.pageNumber < 1) return null;
  const text = pageContinuationHaystack(input);
  const parsed = parsePageOfTotal(text);
  if (parsed && parsed.page < parsed.total) {
    return input.pageNumber + 1;
  }
  if (CONTINUED_RE.test(text)) return input.pageNumber + 1;
  return null;
}

export type ContinuationSearchHit = {
  quote?: string | null;
  text?: string | null;
  pageNumber?: number | null;
};

export function isSplitTableSearchHit(hit: ContinuationSearchHit): boolean {
  const next = continuationPageNumber({
    pageNumber:
      typeof hit.pageNumber === "number" && hit.pageNumber >= 1
        ? hit.pageNumber
        : 1,
    quote: hit.quote,
    text: hit.text,
  });
  return next != null;
}

export function annotateContinuationSearchHits<T extends ContinuationSearchHit>(
  hits: readonly T[]
): {
  results: Array<T & { continues?: true; nextPage?: number }>;
  continuationHits: number;
  keepSearchOpen: boolean;
} {
  let continuationHits = 0;
  const results = hits.map((hit) => {
    const pageNumber =
      typeof hit.pageNumber === "number" && hit.pageNumber >= 1
        ? hit.pageNumber
        : null;
    if (pageNumber == null) return hit;
    const nextPage = continuationPageNumber({
      pageNumber,
      quote: hit.quote,
      text: hit.text,
    });
    if (nextPage == null) return hit;
    continuationHits += 1;
    return {
      ...hit,
      continues: true as const,
      nextPage,
    };
  });
  return {
    results,
    continuationHits,
    keepSearchOpen: continuationHits > 0,
  };
}

/** Distinctive SOP / protocol ids in a filename that also appear in the objective. */
const DOCUMENT_ID_RE = /[A-Za-z]{2,}(?:[-_/][A-Za-z0-9]+){2,}/g;

function documentIdsIn(text: string): string[] {
  return text.match(DOCUMENT_ID_RE) ?? [];
}

export function filenameNamedInObjective(
  filename: string,
  objective: string
): boolean {
  const obj = objective.toLowerCase().trim();
  if (!obj) return false;
  const ids = documentIdsIn(filename);
  const objectiveIds = documentIdsIn(objective);
  const objCompact = obj.replace(/[^a-z0-9]+/g, "");
  for (const id of ids) {
    const needle = id.toLowerCase();
    if (needle.length < 8) continue;
    if (obj.includes(needle)) return true;
    const compact = needle.replace(/[^a-z0-9]+/g, "");
    if (compact.length >= 8 && objCompact.includes(compact)) return true;
    for (const objectiveId of objectiveIds) {
      const other = objectiveId.toLowerCase();
      if (other.length < 8) continue;
      if (needle.includes(other) || other.includes(needle)) return true;
      const otherCompact = other.replace(/[^a-z0-9]+/g, "");
      if (
        otherCompact.length >= 8 &&
        (compact.includes(otherCompact) || otherCompact.includes(compact))
      ) {
        return true;
      }
    }
  }
  const stem = filename.replace(/\.[^.]+$/, "").toLowerCase();
  if (stem.length >= 12 && obj.includes(stem)) return true;
  return false;
}
