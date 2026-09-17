import { sourceCitationBracket } from "@/lib/suggestions/citations-at-end";
import { citationSiteOffset } from "@/lib/citations/citation-site";
import type { TableOperation } from "@/lib/suggestions/table-operation";
import {
  extractHardFacts,
  placeholderForFactKind,
  replaceFactsWithPlaceholders,
  type ClaimProvenance,
  type ClaimProvenanceRecord,
  type HardFact,
  type HardFactKind,
} from "@/lib/ai/chat/claim-facts";
import type { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import {
  mapTableOperationText,
  rewriteCitationPagesInText,
  rewriteTableOperationCitations,
} from "@/lib/ai/chat/citation-grounding";
import { evidenceContainsFact } from "@/lib/ai/chat/evidence-match";
import type { UnsupportedFactPolicy } from "@/lib/customers/packs";

export type { ClaimProvenance, ClaimProvenanceRecord } from "@/lib/ai/chat/claim-facts";

export type GroundDraftResult = {
  text: string;
  provenance: ClaimProvenance;
  unsupported: HardFact[];
  blocked: boolean;
};

function resolveFact(
  fact: HardFact,
  ledger: CitationPageLedger
): ClaimProvenanceRecord {
  const pages = ledger.recordedPages();
  const citedHit = fact.cited
    .map((cite) => {
      const page = pages.find(
        (row) =>
          filenamesMatch(row.filename, cite.filename) &&
          row.pageNumber === cite.page &&
          evidenceContainsFact(row.quote, fact)
      );
      return page
        ? {
            filename: page.filename,
            page: page.pageNumber,
            attachmentId: page.id,
          }
        : null;
    })
    .find((row) => row != null);

  if (citedHit) {
    return {
      text: fact.text,
      kind: fact.kind,
      status: "verified",
      cited: fact.cited[0] ?? null,
      source: citedHit,
    };
  }

  const other = pages.find((row) => evidenceContainsFact(row.quote, fact));
  if (other) {
    return {
      text: fact.text,
      kind: fact.kind,
      status: "citation_moved",
      cited: fact.cited[0] ?? null,
      source: {
        filename: other.filename,
        page: other.pageNumber,
        attachmentId: other.id,
      },
    };
  }

  return {
    text: fact.text,
    kind: fact.kind,
    status: "unsourced",
    cited: fact.cited[0] ?? null,
    source: null,
  };
}

function filenamesMatch(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

const MARKER_AFTER_FACT = /^\s*\[(\d+)(?:\s*,\s*\d+)*\]/;

/** `1. [filename, p. N]` in a trailing Citations: list. */
function numberedCitationLineRe(n: number): RegExp {
  return new RegExp(`(^|\\n)${n}\\. \\[[^\\]\\n]+\\]`);
}

function rewriteParkedListSource(
  text: string,
  n: number,
  source: string
): string | null {
  const re = numberedCitationLineRe(n);
  if (!re.test(text)) return null;
  return text.replace(re, `$1${n}. ${source}`);
}

function applyMovedCitations(
  text: string,
  facts: readonly HardFact[],
  records: readonly ClaimProvenanceRecord[]
): string {
  let next = text;
  const insertions: Array<{ at: number; cite: string }> = [];
  for (let i = facts.length - 1; i >= 0; i--) {
    const fact = facts[i]!;
    const record = records[i]!;
    if (record.status !== "citation_moved" || !record.source) continue;
    const neu = sourceCitationBracket(
      record.source.filename,
      record.source.page
    );
    const alreadyCited = fact.cited.some(
      (cite) =>
        filenamesMatch(cite.filename, record.source!.filename) &&
        cite.page === record.source!.page
    );
    if (alreadyCited) continue;
    let replaced = false;
    for (const cite of fact.cited) {
      const old = sourceCitationBracket(cite.filename, cite.page);
      const idx = next.lastIndexOf(old);
      if (idx >= 0) {
        next = next.slice(0, idx) + neu + next.slice(idx + old.length);
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      const afterFact = next.slice(fact.end);
      const marker = MARKER_AFTER_FACT.exec(afterFact);
      if (marker) {
        const rewritten = rewriteParkedListSource(
          next,
          Number(marker[1]),
          neu
        );
        if (rewritten != null) {
          next = rewritten;
          continue;
        }
      }
      insertions.push({
        at: citationSiteOffset(text, fact.end),
        cite: ` ${neu}`,
      });
    }
  }
  insertions.sort((a, b) => b.at - a.at);
  for (const insertion of insertions) {
    next = next.slice(0, insertion.at) + insertion.cite + next.slice(insertion.at);
  }
  return next;
}

/**
 * Gate hard facts against the retrieval ledger. Empty ledger or pages
 * without served quotes fail open (user-typed facts, tests without
 * retrieval, hydrate miss). When any page quote was served, every
 * extracted hard fact must match some served text.
 */
export function groundDraftText(input: {
  text: string;
  ledger: CitationPageLedger;
  policy: UnsupportedFactPolicy;
}): GroundDraftResult {
  const cited = rewriteCitationPagesInText(input.text, input.ledger);
  if (!input.ledger.hasQuotedPages()) {
    return {
      text: cited,
      provenance: { claims: [], policy: input.policy },
      unsupported: [],
      blocked: false,
    };
  }

  const facts = extractHardFacts(cited);
  const records = facts.map((fact) => resolveFact(fact, input.ledger));
  const withMoved = applyMovedCitations(cited, facts, records);
  const unsupportedFacts = facts.filter(
    (_, index) => records[index]?.status === "unsourced"
  );
  const blocked =
    input.policy === "block" && unsupportedFacts.length > 0;
  const text = blocked
    ? replaceFactsWithPlaceholders(
        withMoved,
        unsupportedFacts.map((fact) => {
          const shifted = extractHardFacts(withMoved).find(
            (candidate) =>
              candidate.kind === fact.kind && candidate.text === fact.text
          );
          return shifted ?? fact;
        })
      )
    : withMoved;

  return {
    text,
    provenance: { claims: records, policy: input.policy },
    unsupported: unsupportedFacts,
    blocked,
  };
}

export function groundTableOperation(input: {
  operation: TableOperation;
  ledger: CitationPageLedger;
  policy: UnsupportedFactPolicy;
}): {
  operation: TableOperation;
  provenance: ClaimProvenance;
  unsupported: HardFact[];
  blocked: boolean;
} {
  const cited = rewriteTableOperationCitations(input.operation, input.ledger);
  if (!input.ledger.hasQuotedPages()) {
    return {
      operation: cited,
      provenance: { claims: [], policy: input.policy },
      unsupported: [],
      blocked: false,
    };
  }

  const claims: ClaimProvenanceRecord[] = [];
  const unsupported: HardFact[] = [];
  let blocked = false;
  const operation = mapTableOperationText(cited, (value) => {
    const grounded = groundDraftText({
      text: value,
      ledger: input.ledger,
      policy: input.policy,
    });
    claims.push(...grounded.provenance.claims);
    unsupported.push(...grounded.unsupported);
    if (grounded.blocked) blocked = true;
    return grounded.text;
  });

  return {
    operation,
    provenance: { claims, policy: input.policy },
    unsupported,
    blocked,
  };
}

export type UnsupportedFactsToolResult = {
  status: "unsupported_facts";
  keepSearchOpen: true;
  message: string;
  unsupported: Array<{ text: string; kind: HardFactKind; placeholder: string }>;
  draftWithPlaceholders: string;
};

export const GATED_FACT_PLACEHOLDERS = [
  "<date>",
  "<identifier>",
  "<number>",
] as const;

export const UNSUPPORTED_FACTS_RETRY_MESSAGE =
  "These facts were not on any retrieved page. Search or read the page that states them, then fill the real value. Do not persist <date>/<identifier>/<number> until that pass. Placeholders are only for facts still missing after the page read this turn.";

export const PLACEHOLDER_NEEDS_RETRIEVAL_MESSAGE =
  "Do not persist <date>/<identifier>/<number> yet. Search or read_document_page for the certificate or record that states the fact, then fill the real value. Placeholders are only for facts still missing after that pass this turn.";

export function containsGatedFactPlaceholders(text: string): boolean {
  return GATED_FACT_PLACEHOLDERS.some((token) => text.includes(token));
}

export function tableOperationContainsGatedPlaceholders(
  operation: TableOperation
): boolean {
  let found = false;
  mapTableOperationText(operation, (value) => {
    if (containsGatedFactPlaceholders(value)) found = true;
    return value;
  });
  return found;
}

export function unsupportedFactsToolResult(input: {
  unsupported: readonly HardFact[];
  draftWithPlaceholders: string;
  message?: string;
}): UnsupportedFactsToolResult {
  return {
    status: "unsupported_facts",
    keepSearchOpen: true,
    message: input.message ?? UNSUPPORTED_FACTS_RETRY_MESSAGE,
    unsupported: input.unsupported.map((fact) => ({
      text: fact.text,
      kind: fact.kind,
      placeholder: placeholderForFactKind(fact.kind),
    })),
    draftWithPlaceholders: input.draftWithPlaceholders,
  };
}
