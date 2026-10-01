/**
 * Cited grep hits that list row titles (SOP Name, Document Name, …) but not
 * the identifier values those columns still need. Same job as
 * `divider=true` / requirement-index: they are locators, not a complete
 * data page, so search stays open.
 *
 * Driven by table-header shape (Number / No. / ID vs Name), not a named
 * SOP special case.
 */

export const IDENTITY_INCOMPLETE_SEARCH_HINT =
  "Hits with identityIncomplete=true name row titles but not document / SOP / reference numbers. Grep again for those identifier values before drafting.";

export type IdentityIncompleteSearchHit = {
  quote?: string | null;
  text?: string | null;
};

/** Document-number / SOP-number / protocol-number shaped tokens. */
const IDENTITY_ID_RE =
  /\b[A-Za-z]{2,}\d{0,4}[-/][A-Za-z0-9]{2,}(?:[-/][A-Za-z0-9]+)+\b/;

const PROCEDURE_TITLE_RE = /standard operating procedure/i;

const NAME_HEADER_RE =
  /\b(?:sop|document)\s+name\b|\bname of the document\b/i;

function snippetOf(hit: IdentityIncompleteSearchHit): string {
  return `${hit.quote ?? ""}\n${hit.text ?? ""}`.replace(/\s+/g, " ").trim();
}

function titleClauseCount(snippet: string): number {
  const matches =
    snippet.match(
      /\b[A-Z][A-Za-z][A-Za-z0-9&/]*(?:\s+[A-Za-z][A-Za-z0-9&/']*){2,}\b/g
    ) ?? [];
  return new Set(matches.map((clause) => clause.toLowerCase())).size;
}

/**
 * True when the snippet can name rows but cannot fill Number / ID cells.
 */
export function isIdentityIncompleteHit(
  hit: IdentityIncompleteSearchHit
): boolean {
  const snippet = snippetOf(hit);
  if (!snippet) return false;
  if (IDENTITY_ID_RE.test(snippet)) return false;
  if (PROCEDURE_TITLE_RE.test(snippet)) return true;
  if (NAME_HEADER_RE.test(snippet)) return true;
  return titleClauseCount(snippet) >= 2;
}

export function annotateIdentityIncompleteSearchHits<
  T extends IdentityIncompleteSearchHit,
>(
  hits: readonly T[]
): {
  results: Array<T & { identityIncomplete?: true }>;
  identityIncompleteHits: number;
  keepSearchOpen: boolean;
} {
  let identityIncompleteHits = 0;
  const results = hits.map((hit) => {
    if (!isIdentityIncompleteHit(hit)) return hit;
    identityIncompleteHits += 1;
    return { ...hit, identityIncomplete: true as const };
  });
  return {
    results,
    identityIncompleteHits,
    keepSearchOpen: hits.length > 0 && identityIncompleteHits >= hits.length,
  };
}
