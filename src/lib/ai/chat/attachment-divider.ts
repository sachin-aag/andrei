/**
 * Attachment cover / title sheets that grep hits before the actual table.
 * A cited divider must not close the Document-chat grep loop the way a
 * data page does — the certificate (or record) is on the following pages.
 *
 * Local IDF / per-file diversity (D2/D3) can demote cover tokens in rank
 * but do not replace this: a cover hit still has to keep search open so
 * p. N+1 can be read.
 */

const DIVIDER_RE =
  /attachment\s+no\.?\s*\d|calibrat(?:ion)?\s+certifc?ate\s+of|(?:inbuilt|external)\s+instruments?|certificate\s+of\s+(?:inbuilt|external)/i;

const RUNNING_HEADER_MAGNET_RE =
  /\baseptic\s+processing\b|\bs\.?\s*no\.?\s*mf\b|\bmf\s+project\s+id\b/i;

const APS_FACT_RE =
  /\bmedia[\s-]?fill\b|\baseptic\s+process\s+simulation\b|\bMF\/(?:DP|PR)\//i;

const DATE_RE = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;
const CERT_NO_RE = /\b20\d{2}\/\d{3,}\b/;
const TABLE_FACT_RE = /\b(?:as found|as left|due date|certificate no|make\/model|sr\.?\s*no)\b/i;

/** Snippets long enough to be the filled cert table, not the cover sheet. */
const TABLE_SNIPPET_CHARS = 220;

export const DIVIDER_SEARCH_HINT =
  "Hits with divider=true are attachment cover/title pages, not the data table. Read the following page (p. N+1) before drafting. They do not count as a cited data page.";

export type DividerSearchHit = {
  quote?: string | null;
  text?: string | null;
  pageNumber?: number | null;
};

function snippetOf(hit: DividerSearchHit): string {
  return `${hit.quote ?? ""}\n${hit.text ?? ""}`.replace(/\s+/g, " ").trim();
}

function looksLikeCertTable(snippet: string): boolean {
  if (snippet.length < TABLE_SNIPPET_CHARS) return false;
  return DATE_RE.test(snippet) || CERT_NO_RE.test(snippet) || TABLE_FACT_RE.test(snippet);
}

export function isAttachmentDividerHit(hit: DividerSearchHit): boolean {
  const snippet = snippetOf(hit);
  if (!snippet) return false;
  if (looksLikeCertTable(snippet)) return false;
  if (APS_FACT_RE.test(snippet)) return false;
  if (DIVIDER_RE.test(snippet)) return true;
  return RUNNING_HEADER_MAGNET_RE.test(snippet);
}

export function annotateDividerSearchHits<T extends DividerSearchHit>(
  hits: readonly T[]
): {
  results: Array<
    T & {
      divider?: true;
      nextPage?: number;
    }
  >;
  dividerHits: number;
  keepSearchOpen: boolean;
} {
  let dividerHits = 0;
  const results = hits.map((hit) => {
    if (!isAttachmentDividerHit(hit)) return hit;
    dividerHits += 1;
    const page =
      typeof hit.pageNumber === "number" && hit.pageNumber >= 1
        ? hit.pageNumber + 1
        : undefined;
    return {
      ...hit,
      divider: true as const,
      ...(page !== undefined ? { nextPage: page } : {}),
    };
  });
  return {
    results,
    dividerHits,
    keepSearchOpen: hits.length > 0 && dividerHits >= hits.length,
  };
}
