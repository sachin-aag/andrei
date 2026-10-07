import {
  CITATIONS_HEADING,
  citationNumbersFromText,
  sourceCitationBracket,
  sourceCitationsByNumber,
  trailingIsCitationBlock,
} from "@/lib/suggestions/citations-at-end";
import { citationSiteOffset, splitSentences } from "@/lib/citations/citation-site";
import type { JSONContent } from "@tiptap/core";
import {
  isLeftoverPlaceholderCellText,
  type TableOperation,
} from "@/lib/suggestions/table-operation";
import {
  citedPagesFromText,
  extractHardFacts,
  placeholderForFactKind,
  replaceFactsWithPlaceholders,
  type CitedPage,
  type ClaimProvenance,
  type ClaimProvenanceRecord,
  type HardFact,
  type HardFactKind,
} from "@/lib/ai/chat/claim-facts";
import type {
  CitationPageLedger,
  RecordedCitationPage,
} from "@/lib/ai/chat/citation-grounding";
import {
  mapTableOperationText,
  rewriteCitationPagesInText,
  rewriteTableOperationCitations,
} from "@/lib/ai/chat/citation-grounding";
import { factSupportedByQuote } from "@/lib/ai/chat/fact-support";
import {
  analysisSupportingFact,
  type AnalysisEvidence,
} from "@/lib/ai/chat/analysis-evidence";
import {
  calculationSupportingFact,
  type CalculationEvidence,
} from "@/lib/ai/chat/calculate";
import type { UnsupportedFactPolicy } from "@/lib/customers/packs";
import {
  isExemptFrameFact,
  isExplicitInsertRequest,
  shouldKeepUnsupportedFact,
  type GroundDraftGrounding,
} from "@/lib/ai/chat/citation-exemption";
import {
  compact3xperLitreVolumes,
  usesCvpKLitreStyle,
} from "@/lib/document-types/3xper-volume-style";
import { elrTableHeadersForSection } from "@/lib/document-types/elr/sections";
import {
  attachLiveTableRowContext,
  backfillQsrSopEffectiveDates,
  dateSupportedAsLabeledField,
  documentFamilyFromContext,
  extraQsrUnsupported,
  factIsRowKey,
  factSupportedForRowKey,
  filenameMatchesFamily,
  isClearOnlyOptionalRtmEdit,
  isLabeledDateColumnLabel,
  isQsrRtmOptionalReferenceColumn,
  isRtmNotFoundMarker,
  qsrFailClosedReason,
  qsrReferenceValueOnCitedPage,
  resolveRtmFamilyCell,
  rtmFamilyAtColumn,
  qsrTableColumnLabel,
  rowKeyFromContext,
  editCellsGroupKey,
  syntheticUnsupportedFact,
} from "@/lib/ai/chat/qsr-row-grounding";
import {
  citationNumbersFromMarker,
  formatNumericCitationMarker,
} from "@/lib/placeholders/citation-bracket";
import { collectPlaceholderSpans } from "@/lib/placeholders/find";

export type { ClaimProvenance, ClaimProvenanceRecord } from "@/lib/ai/chat/claim-facts";

function styleCvpDraftText(
  text: string,
  section: string | undefined,
  blocked: boolean
): string {
  if (blocked || !usesCvpKLitreStyle(section)) return text;
  return compact3xperLitreVolumes(text);
}

export type GroundDropReason = "fail_closed" | "unsourced_fact" | "qsr_extra";

export type GroundDraftResult = {
  text: string;
  provenance: ClaimProvenance;
  unsupported: HardFact[];
  blocked: boolean;
  /** Why a blocked write dropped, for claim_unsupported audit metadata. */
  dropReason?: GroundDropReason;
};

function filenamesMatch(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function uniqueCited(pages: readonly CitedPage[]): CitedPage[] {
  const seen = new Set<string>();
  const out: CitedPage[] = [];
  for (const page of pages) {
    const key = `${page.filename.trim().toLowerCase()}|${page.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(page);
  }
  return out;
}

function sourceFromPage(page: RecordedCitationPage): {
  filename: string;
  page: number;
  attachmentId: string;
} {
  return {
    filename: page.filename,
    page: page.pageNumber,
    attachmentId: page.id,
  };
}

function findCitedLedgerPage(
  cite: CitedPage,
  pages: readonly RecordedCitationPage[]
): RecordedCitationPage | undefined {
  return pages.find(
    (row) =>
      filenamesMatch(row.filename, cite.filename) && row.pageNumber === cite.page
  );
}

function sentenceAround(text: string, start: number, end: number): string {
  for (const span of splitSentences(text)) {
    if (start >= span.start && start < span.end) {
      return text.slice(span.start, span.end);
    }
  }
  return text.slice(Math.max(0, start - 80), Math.min(text.length, end + 80));
}

function filenameMentionsIdentifier(
  filename: string,
  id: HardFact
): boolean {
  const hay = filename.toLowerCase().replace(/\s+/g, "");
  const needles = [id.text, id.normalized].map((value) =>
    value.toLowerCase().replace(/\s+/g, "")
  );
  return needles.some((needle) => needle.length >= 4 && hay.includes(needle));
}

function pageMatchesIdentifiers(
  page: RecordedCitationPage,
  identifiers: readonly HardFact[]
): boolean {
  return identifiers.some(
    (id) =>
      factSupportedByQuote(page.quote, id) ||
      filenameMentionsIdentifier(page.filename, id)
  );
}

/** Page-read ledgers may pin an uncited number; a hydrated review dump may not. */
export const NUMBER_MOVE_SMALL_LEDGER = 8;

function rankMoveTarget(input: {
  matches: readonly RecordedCitationPage[];
  fact: HardFact;
  cited: RecordedCitationPage | null;
  identifiers: readonly HardFact[];
  quotedPageCount: number;
}): RecordedCitationPage | null {
  const { matches, fact, cited, identifiers, quotedPageCount } = input;
  if (matches.length === 0) return null;

  if (cited) {
    const sameFile = matches.filter((page) =>
      filenamesMatch(page.filename, cited.filename)
    );
    if (sameFile.length > 0) {
      if (fact.kind === "number" && sameFile.length > 1) return null;
      return [...sameFile].sort(
        (a, b) =>
          Math.abs(a.pageNumber - cited.pageNumber) -
          Math.abs(b.pageNumber - cited.pageNumber)
      )[0]!;
    }
  }

  if (identifiers.length > 0) {
    const idHits = matches.filter((page) =>
      pageMatchesIdentifiers(page, identifiers)
    );
    if (idHits.length === 1) return idHits[0]!;
    if (idHits.length > 1 && fact.kind !== "number") {
      return idHits[0]!;
    }
  }

  if (fact.kind === "date" && matches.length > 1 && cited) return null;
  // Uncited / cross-file numbers must not attach a coincidental ledger page
  // (hydrated review transcripts often contain 5,000 / 0 on unrelated PQ rows).
  // Same-file unique hit and unique identifier pin already returned above.
  // A one-page (or small page-read) ledger may still insert a missing cite.
  if (fact.kind === "number") {
    if (!cited && matches.length === 1 && quotedPageCount <= NUMBER_MOVE_SMALL_LEDGER) {
      return matches[0]!;
    }
    return null;
  }
  return matches[0]!;
}

function resolveTableColumnLabel(input: {
  section?: string;
  col?: number;
  override?: string;
}): string | undefined {
  const override = input.override?.trim();
  if (override) return override;
  const qsr = qsrTableColumnLabel(input.section, input.col);
  if (qsr) return qsr;
  if (!input.section || input.col == null || input.col < 0) return undefined;
  return elrTableHeadersForSection(input.section)[input.col];
}

function pageSupportsFact(
  quote: string,
  fact: HardFact,
  rowKey: string | null,
  columnLabel?: string,
  presenceFallback = false
): boolean {
  if (columnLabel && isLabeledDateColumnLabel(columnLabel)) {
    const labeled = dateSupportedAsLabeledField(quote, fact, columnLabel);
    if (labeled === true) return true;
    if (labeled === false && !presenceFallback) return false;
  }
  if (rowKey && !factIsRowKey(fact, rowKey)) {
    return factSupportedForRowKey(quote, fact, rowKey);
  }
  return factSupportedByQuote(quote, fact);
}

function resolveFact(
  fact: HardFact,
  ledger: CitationPageLedger,
  extras: {
    sentence: string;
    context?: string;
    analyses?: readonly AnalysisEvidence[];
    calculations?: readonly CalculationEvidence[];
    section?: string;
    columnLabel?: string;
    presenceFallback?: boolean;
  }
): ClaimProvenanceRecord {
  const pages = ledger.recordedPages();
  const rowKey = rowKeyFromContext(extras.context ?? extras.sentence);
  const columnLabel = extras.columnLabel?.trim() || undefined;
  const presenceFallback = Boolean(extras.presenceFallback);
  const docFamily =
    extras.section === "qsr_qualification_documents" ||
    extras.section === "qsr_references"
      ? documentFamilyFromContext(extras.context ?? extras.sentence)
      : null;
  const cited = uniqueCited([
    ...fact.cited,
    ...citedPagesFromText(extras.context ?? ""),
  ]);
  const citedPages = cited
    .map((cite) => findCitedLedgerPage(cite, pages))
    .filter((row): row is RecordedCitationPage => row != null);
  const citedHit = citedPages.find(
    (row) =>
      (!docFamily || filenameMatchesFamily(row.filename, docFamily)) &&
      pageSupportsFact(
        row.quote,
        fact,
        rowKey,
        columnLabel,
        presenceFallback
      )
  );
  const primaryCited = citedPages[0] ?? null;
  const identifiers = extractHardFacts(
    [extras.sentence, extras.context ?? ""].filter(Boolean).join("\n")
  ).filter(
    (row) =>
      row.kind === "identifier" &&
      (fact.kind !== "identifier" || row.normalized !== fact.normalized)
  );

  if (citedHit) {
    return {
      text: fact.text,
      kind: fact.kind,
      status: "verified",
      cited: cited[0] ?? null,
      source: sourceFromPage(citedHit),
    };
  }

  const matches = pages.filter((row) => {
    if (docFamily && !filenameMatchesFamily(row.filename, docFamily)) {
      return false;
    }
    return pageSupportsFact(
      row.quote,
      fact,
      rowKey,
      columnLabel,
      presenceFallback
    );
  });
  const quotedPageCount = pages.filter((row) => row.quote.trim()).length;
  const ranked = rankMoveTarget({
    matches,
    fact,
    cited: primaryCited,
    identifiers,
    quotedPageCount,
  });

  const labeledDateRejected =
    !presenceFallback &&
    Boolean(columnLabel) &&
    dateSupportedAsLabeledField(
      primaryCited?.quote ?? "",
      fact,
      columnLabel ?? ""
    ) === false;

  const lenientDate =
    !rowKey &&
    !docFamily &&
    primaryCited &&
    fact.kind === "date" &&
    !labeledDateRejected;

  if (lenientDate && !primaryCited.quote.trim()) {
    return {
      text: fact.text,
      kind: fact.kind,
      status: "verified",
      cited: cited[0] ?? null,
      source: sourceFromPage(primaryCited),
    };
  }

  if (ranked) {
    const alreadyCited = cited.some(
      (cite) =>
        filenamesMatch(cite.filename, ranked.filename) &&
        cite.page === ranked.pageNumber
    );
    if (alreadyCited || (primaryCited &&
        filenamesMatch(ranked.filename, primaryCited.filename) &&
        ranked.pageNumber === primaryCited.pageNumber)) {
      return {
        text: fact.text,
        kind: fact.kind,
        status: "verified",
        cited: cited[0] ?? null,
        source: sourceFromPage(ranked),
      };
    }
    return {
      text: fact.text,
      kind: fact.kind,
      status: "citation_moved",
      cited: cited[0] ?? null,
      source: sourceFromPage(ranked),
    };
  }

  if (lenientDate) {
    return {
      text: fact.text,
      kind: fact.kind,
      status: "verified",
      cited: cited[0] ?? null,
      source: sourceFromPage(primaryCited),
    };
  }

  // A value a saved analysis computed over cited rows is derivable, not
  // invented — the charts precedent applied to scalars. It is cited to the
  // analysis and to the pages those rows came from. A number no analysis
  // computed, or one that contradicts the analysis, still falls through.
  const backing = analysisSupportingFact(fact, extras.analyses ?? []);
  if (backing) {
    return {
      text: fact.text,
      kind: fact.kind,
      status: "verified",
      cited: cited[0] ?? null,
      source: null,
      analysis: {
        analysisId: backing.analysisId,
        title: backing.title,
        pages: backing.pages,
      },
    };
  }

  // Same argument as analyses: a product the calculate tool just returned is
  // derivable, not invented. Operands still have to sit on a retrieved page.
  const calculated = calculationSupportingFact(
    fact,
    extras.calculations ?? []
  );
  if (calculated) {
    return {
      text: fact.text,
      kind: fact.kind,
      status: "verified",
      cited: cited[0] ?? null,
      source: null,
      calculation: { expression: calculated.expression },
    };
  }

  return {
    text: fact.text,
    kind: fact.kind,
    status: "unsourced",
    cited: cited[0] ?? null,
    source: null,
  };
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

function parkedNumberIsShared(text: string, n: number): boolean {
  const re = /\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (citationNumbersFromMarker(match[0]).includes(n)) count += 1;
    if (count > 1) return true;
  }
  return false;
}

function nextUnusedCitationNumber(text: string): number {
  const used = citationNumbersFromText(text);
  let n = 1;
  while (used.has(n)) n += 1;
  return n;
}

function numberForParkedSource(text: string, source: string): number | null {
  for (const [n, parked] of sourceCitationsByNumber(text)) {
    if (parked === source) return n;
  }
  return null;
}

function appendParkedCitationLine(
  text: string,
  n: number,
  source: string
): string {
  const line = `${n}. ${source}`;
  if (trailingIsCitationBlock(text)) {
    return `${text.replace(/\s*$/, "")}\n${line}`;
  }
  const body = text.replace(/\s*$/, "");
  const block = `${CITATIONS_HEADING}\n${line}`;
  return body ? `${body}\n\n${block}` : block;
}

function assignParkedSource(
  text: string,
  source: string
): { text: string; number: number } {
  const existing = numberForParkedSource(text, source);
  if (existing != null) return { text, number: existing };
  const n = nextUnusedCitationNumber(text);
  return { text: appendParkedCitationLine(text, n, source), number: n };
}

function retargetMarkerAfterFact(
  text: string,
  fact: HardFact,
  marker: RegExpExecArray,
  newN: number
): string {
  const markerStart = fact.end + marker.index;
  const markerEnd = markerStart + marker[0].length;
  const leadingWs = /^\s*/.exec(marker[0])?.[0] ?? "";
  const oldBracket = marker[0].trimStart();
  const oldN = Number(marker[1]);
  const nextNumbers = citationNumbersFromMarker(oldBracket).map((n) =>
    n === oldN ? newN : n
  );
  const neu = formatNumericCitationMarker(nextNumbers);
  return text.slice(0, markerStart) + leadingWs + neu + text.slice(markerEnd);
}

function applyMovedCitations(
  text: string,
  facts: readonly HardFact[],
  records: readonly ClaimProvenanceRecord[],
  pinCitationsToEnd = false
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
    const afterFact = next.slice(fact.end);
    const marker = MARKER_AFTER_FACT.exec(afterFact);
    if (marker) {
      const n = Number(marker[1]);
      if (parkedNumberIsShared(next, n)) {
        const assigned = assignParkedSource(next, neu);
        next = retargetMarkerAfterFact(
          assigned.text,
          fact,
          marker,
          assigned.number
        );
        continue;
      }
      const rewritten = rewriteParkedListSource(next, n, neu);
      if (rewritten != null) {
        next = rewritten;
        continue;
      }
    }
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
      insertions.push({
        at: pinCitationsToEnd
          ? text.length
          : citationSiteOffset(text, fact.end),
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
  grounding?: GroundDraftGrounding;
  /** Sibling table-row text (documentRef, etc.) used to rank citation moves. */
  context?: string;
  /** Saved analyses whose computed values count as evidence. */
  analyses?: readonly AnalysisEvidence[];
  /** This-turn `calculate` results whose products count as evidence. */
  calculations?: readonly CalculationEvidence[];
}): GroundDraftResult {
  const cited = rewriteCitationPagesInText(input.text, input.ledger);
  const mode = input.grounding?.mode ?? "strict";
  const keepSource = {
    latestUserMessageText: input.grounding?.latestUserMessageText,
    recentAssistantTexts: input.grounding?.recentAssistantTexts,
  };
  const keepTurn = isExplicitInsertRequest(
    input.grounding?.latestUserMessageText ?? ""
  );
  const failClosed = keepTurn
    ? null
    : qsrFailClosedReason({
        section: input.grounding?.section,
        attachedFilenames: input.grounding?.attachedFilenames,
        ledger: input.ledger,
      });
  if (failClosed) {
    const blocked = input.policy === "block";
    return {
      text: styleCvpDraftText(cited, input.grounding?.section, blocked),
      provenance: { claims: [], policy: input.policy },
      unsupported: [syntheticUnsupportedFact(failClosed)],
      blocked,
      dropReason: blocked ? "fail_closed" : undefined,
    };
  }
  if (!input.ledger.hasQuotedPages() || mode === "skip") {
    return {
      text: styleCvpDraftText(cited, input.grounding?.section, false),
      provenance: { claims: [], policy: input.policy },
      unsupported: [],
      blocked: false,
    };
  }

  const facts = extractHardFacts(cited);
  const records = facts.map((fact) => {
    const keepFact =
      keepTurn || shouldKeepUnsupportedFact(fact, keepSource);
    if (
      mode === "frame" &&
      isExemptFrameFact(fact, {
        reportMetadata: input.grounding?.reportMetadata,
        latestUserMessageText: input.grounding?.latestUserMessageText,
        alreadyStatedText: input.grounding?.alreadyStatedText,
      })
    ) {
      return {
        text: fact.text,
        kind: fact.kind,
        status: "verified" as const,
        cited: fact.cited[0] ?? null,
        source: null,
      };
    }
    return resolveFact(fact, input.ledger, {
      sentence: sentenceAround(cited, fact.start, fact.end),
      context: input.context,
      analyses: input.analyses,
      calculations: input.calculations,
      section: input.grounding?.section,
      columnLabel: resolveTableColumnLabel({
        section: input.grounding?.section,
        col: input.grounding?.tableCol,
        override: input.grounding?.tableColumnLabel,
      }),
      presenceFallback: keepFact,
    });
  });
  const withMoved = applyMovedCitations(
    cited,
    facts,
    records,
    Boolean(
      rtmFamilyAtColumn(
        input.grounding?.section,
        input.grounding?.tableCol ?? -1
      )
    )
  );
  const unsourcedFacts = facts.filter((fact, index) => {
    if (records[index]?.status !== "unsourced") return false;
    return !(keepTurn || shouldKeepUnsupportedFact(fact, keepSource));
  });
  const extraUnsupported = extraQsrUnsupported({
    cell: cited,
    context: input.context ?? cited,
    section: input.grounding?.section,
    tableCol: input.grounding?.tableCol,
    tableColumnLabel: resolveTableColumnLabel({
      section: input.grounding?.section,
      col: input.grounding?.tableCol,
      override: input.grounding?.tableColumnLabel,
    }),
    ledger: input.ledger,
  }).filter(
    (fact) => !(keepTurn || shouldKeepUnsupportedFact(fact, keepSource))
  );
  const unsupportedFacts = [...unsourcedFacts, ...extraUnsupported];
  const blocked =
    input.policy === "block" && unsupportedFacts.length > 0;
  const text = blocked
    ? replaceFactsWithPlaceholders(
        withMoved,
        unsourcedFacts.map((fact) => {
          const shifted = extractHardFacts(withMoved).find(
            (candidate) =>
              candidate.kind === fact.kind && candidate.text === fact.text
          );
          return shifted ?? fact;
        })
      )
    : withMoved;

  // A verified fact with no source is a frame exemption — identity, a date
  // bound, something already in the report — and has nothing to trace. One
  // backed by a saved analysis or this-turn calculate does: Traceability
  // shows the derivation.
  const provenanceClaims = records.filter(
    (record) =>
      !(
        record.status === "verified" &&
        !record.source &&
        !record.analysis &&
        !record.calculation
      )
  );

  const dropReason: GroundDropReason | undefined = !blocked
    ? undefined
    : unsourcedFacts.length > 0
      ? "unsourced_fact"
      : extraUnsupported.length > 0
        ? "qsr_extra"
        : undefined;
  return {
    text: styleCvpDraftText(text, input.grounding?.section, blocked),
    provenance: { claims: provenanceClaims, policy: input.policy },
    unsupported: unsupportedFacts,
    blocked,
    dropReason,
  };
}

export function groundTableOperation(input: {
  operation: TableOperation;
  ledger: CitationPageLedger;
  policy: UnsupportedFactPolicy;
  grounding?: GroundDraftGrounding;
  /** Saved analyses whose computed values count as evidence. */
  analyses?: readonly AnalysisEvidence[];
  /** This-turn `calculate` results whose products count as evidence. */
  calculations?: readonly CalculationEvidence[];
  /**
   * After repair, empty unsupported RTM family / Remarks cells
   * instead of blocking the URS copy.
   */
  clearOptionalOnBlock?: boolean;
  /**
   * Live field JSON so `edit_cells` can topic-match protocol pages from
   * Parameters / User requirements when the model omitted `rowContext`.
   */
  fieldDoc?: JSONContent | null;
}): {
  operation: TableOperation;
  provenance: ClaimProvenance;
  unsupported: HardFact[];
  blocked: boolean;
  dropReason?: GroundDropReason;
} {
  const cited = rewriteTableOperationCitations(
    attachLiveTableRowContext(input.operation, input.fieldDoc),
    input.ledger
  );
  const failClosed =
    isClearOnlyOptionalRtmEdit(cited, input.grounding?.section) ||
    isExplicitInsertRequest(input.grounding?.latestUserMessageText ?? "")
      ? null
      : qsrFailClosedReason({
          section: input.grounding?.section,
          attachedFilenames: input.grounding?.attachedFilenames,
          ledger: input.ledger,
        });
  if (failClosed) {
    return {
      operation: cited,
      provenance: { claims: [], policy: input.policy },
      unsupported: [syntheticUnsupportedFact(failClosed)],
      blocked: input.policy === "block",
      dropReason: input.policy === "block" ? "fail_closed" : undefined,
    };
  }
  if (!input.ledger.hasQuotedPages()) {
    return {
      operation: cited,
      provenance: { claims: [], policy: input.policy },
      unsupported: [],
      blocked: false,
    };
  }

  const dated = backfillQsrSopEffectiveDates(
    cited,
    input.ledger,
    input.grounding?.section
  );

  const claims: ClaimProvenanceRecord[] = [];
  const unsupported: HardFact[] = [];
  let blocked = false;
  let dropReason: GroundDropReason | undefined;
  const groundValue = (
    value: string,
    context: string | undefined,
    col?: number,
    columnLabel?: string
  ): string => {
    if (
      col != null &&
      isQsrRtmOptionalReferenceColumn(input.grounding?.section, col) &&
      !value.trim()
    ) {
      return "";
    }
    const family =
      col != null
        ? rtmFamilyAtColumn(input.grounding?.section, col)
        : null;
    let next = value;
    if (family) {
      if (isRtmNotFoundMarker(value)) return "NA";
      const key = rowKeyFromContext(context ?? "") ?? "";
      const resolved = resolveRtmFamilyCell({
        cell: value,
        family,
        key,
        context: context ?? "",
        ledger: input.ledger,
      });
      switch (resolved.action) {
        case "clear":
          return "";
        case "replace":
          if (!resolved.text) return "";
          next =
            resolved.citation && !resolved.text.includes(resolved.citation)
              ? `${resolved.text} ${resolved.citation}`
              : resolved.text;
          break;
        case "keep":
          break;
        default: {
          const exhaustive: never = resolved;
          return exhaustive;
        }
      }
    }
    const grounded = groundDraftText({
      text: next,
      ledger: input.ledger,
      policy: input.policy,
      grounding: {
        ...input.grounding,
        tableCol: col,
        tableColumnLabel: resolveTableColumnLabel({
          section: input.grounding?.section,
          col,
          override: columnLabel ?? input.grounding?.tableColumnLabel,
        }),
      },
      context,
      analyses: input.analyses,
      calculations: input.calculations,
    });
    const clearOptional =
      Boolean(input.clearOptionalOnBlock) &&
      grounded.blocked &&
      col != null &&
      isQsrRtmOptionalReferenceColumn(input.grounding?.section, col);
    if (clearOptional) {
      return "";
    }
    claims.push(...grounded.provenance.claims);
    unsupported.push(...grounded.unsupported);
    if (grounded.blocked) {
      blocked = true;
      if (!dropReason && grounded.dropReason) dropReason = grounded.dropReason;
    }
    return grounded.text;
  };

  let operation: TableOperation;
  switch (dated.kind) {
    case "edit_cells":
      operation = {
        ...dated,
        cells: dated.cells.map((cell) => {
          const context = dated.cells
            .filter(
              (rowCell) => editCellsGroupKey(rowCell) === editCellsGroupKey(cell)
            )
            .flatMap((rowCell) => [
              rowCell.rowKey,
              rowCell.insertText,
              rowCell.expectedText,
              rowCell.rowContext,
            ])
            .filter((part): part is string => Boolean(part?.trim()))
            .join("\n");
          return {
            ...cell,
            insertText: groundValue(
              cell.insertText,
              context,
              cell.col,
              resolveTableColumnLabel({
                section: input.grounding?.section,
                col: cell.col,
              })
            ),
          };
        }),
      };
      if (input.grounding?.section === "qsr_references") {
        const kept = operation.cells.filter(
          (cell) =>
            cell.col !== 1 ||
            !cell.insertText.trim() ||
            qsrReferenceValueOnCitedPage(cell.insertText, input.ledger)
        );
        if (kept.length === 0 && operation.cells.length > 0) {
          blocked = true;
          if (!dropReason) dropReason = "qsr_extra";
          unsupported.push(
            syntheticUnsupportedFact(
              "reference number not printed on the cited page"
            )
          );
        } else {
          operation = { ...operation, cells: kept };
        }
      }
      if (input.clearOptionalOnBlock) {
        const explicitClears = new Set(
          dated.cells
            .filter(
              (cell) =>
                isQsrRtmOptionalReferenceColumn(
                  input.grounding?.section,
                  cell.col
                ) && !cell.insertText.trim()
            )
            .map((cell) => `${editCellsGroupKey(cell)}:${cell.col}`)
        );
        const kept = operation.cells.filter((cell) => {
          if (
            isQsrRtmOptionalReferenceColumn(
              input.grounding?.section,
              cell.col
            ) &&
            !cell.insertText.trim()
          ) {
            return explicitClears.has(
              `${editCellsGroupKey(cell)}:${cell.col}`
            );
          }
          return true;
        });
        operation = { ...operation, cells: kept };
        if (kept.length === 0 && dated.cells.length > 0) blocked = true;
      }
      break;
    case "insert_rows":
      operation = {
        ...dated,
        rows: dated.rows.map((row) => {
          const context = row.join("\n");
          return row.map((cell, col) =>
            groundValue(
              cell,
              context,
              col,
              resolveTableColumnLabel({
                section: input.grounding?.section,
                col,
              })
            )
          );
        }),
      };
      break;
    case "insert_column":
      operation = {
        ...dated,
        header: groundValue(dated.header, dated.header),
        values: dated.values?.map((value) =>
          groundValue(value, `${dated.header}\n${value}`, undefined, dated.header)
        ),
      };
      break;
    case "create_table":
      operation = {
        ...dated,
        headers: dated.headers.map((header) =>
          groundValue(header, dated.headers.join("\n"))
        ),
        rows: dated.rows?.map((row) => {
          const context = [...dated.headers, ...row].join("\n");
          return row.map((cell, col) =>
            groundValue(cell, context, col, dated.headers[col])
          );
        }),
      };
      break;
    case "delete_rows":
    case "delete_column":
    case "delete_table":
      operation = dated;
      break;
    default: {
      const exhaustive: never = dated;
      return exhaustive;
    }
  }

  return {
    operation,
    provenance: { claims, policy: input.policy },
    unsupported,
    blocked,
    dropReason: blocked ? dropReason : undefined,
  };
}

export type UnsupportedFactsRepairHit = {
  filename: string;
  pageNumber: number;
  quote: string;
  citation: string;
};

export type UnsupportedFactsToolResult = {
  status: "unsupported_facts";
  keepSearchOpen: true;
  message: string;
  unsupported: Array<{ text: string; kind: HardFactKind; placeholder: string }>;
  draftWithPlaceholders: string;
  repairHits?: UnsupportedFactsRepairHit[];
};

export const GATED_FACT_PLACEHOLDERS = [
  "<date>",
  "<identifier>",
  "<number>",
] as const;

export const UNSUPPORTED_FACTS_RETRY_MESSAGE =
  "These facts were not on any retrieved page. Search or read the page that states them, then fill the real value. Leftover <date>/<identifier>/<number> are for facts still missing after that lookup — do not invent the value.";

export const TABLE_PLACEHOLDER_LOOKUP_MESSAGE =
  "These table cells are still placeholders. Search or read the page that states them, then fill the real value. Do not persist angle-bracket placeholders in the table until that lookup. Leftover <date>/<identifier>/<number> are only for facts still missing after that subsequent search — do not invent the value.";

export function containsGatedFactPlaceholders(text: string): boolean {
  return GATED_FACT_PLACEHOLDERS.some((token) => text.includes(token));
}

export function containsTablePlaceholders(text: string): boolean {
  return collectPlaceholderSpans(text).length > 0;
}

export function tablePlaceholderLabels(operation: TableOperation): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  mapTableOperationText(operation, (value) => {
    for (const span of collectPlaceholderSpans(value)) {
      const key = span.text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(span.text);
    }
    return value;
  });
  return labels;
}

/**
 * Leftover lookup tokens, including HTML-shaped labels such as `<section>`
 * that live-scan skips.
 */
export function tableLookupPlaceholderLabels(
  operation: TableOperation
): string[] {
  const labels = tablePlaceholderLabels(operation);
  const seen = new Set(labels.map((label) => label.toLowerCase()));
  const add = (text: string) => {
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    labels.push(text);
  };
  if (operation.kind === "edit_cells") {
    for (const cell of operation.cells) {
      const trimmed = cell.insertText.trim();
      if (isLeftoverPlaceholderCellText(trimmed)) add(trimmed);
    }
  }
  if (operation.kind === "insert_rows") {
    for (const row of operation.rows) {
      for (const value of row) {
        const trimmed = (value ?? "").trim();
        if (isLeftoverPlaceholderCellText(trimmed)) add(trimmed);
      }
    }
  }
  return labels;
}

/** Every text value in a table operation, joined so prose-level checks can run on cells. */
export function tableOperationPlainText(operation: TableOperation): string {
  const parts: string[] = [];
  mapTableOperationText(operation, (value) => {
    if (value.trim()) parts.push(value);
    return value;
  });
  return parts.join("\n");
}

export function tableOperationContainsPlaceholders(
  operation: TableOperation
): boolean {
  return tablePlaceholderLabels(operation).length > 0;
}

export function tablePlaceholderLookupMessage(
  labels: readonly string[]
): string {
  const listed = labels.slice(0, 8).join(", ");
  return listed
    ? `${TABLE_PLACEHOLDER_LOOKUP_MESSAGE} Missing: ${listed}.`
    : TABLE_PLACEHOLDER_LOOKUP_MESSAGE;
}

export function unsupportedFactsToolResult(input: {
  unsupported: readonly HardFact[];
  draftWithPlaceholders: string;
  message?: string;
  repairHits?: UnsupportedFactsRepairHit[];
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
    ...(input.repairHits && input.repairHits.length > 0
      ? { repairHits: input.repairHits }
      : {}),
  };
}
