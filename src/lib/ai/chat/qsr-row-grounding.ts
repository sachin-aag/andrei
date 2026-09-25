import type { HardFact } from "@/lib/ai/chat/claim-facts";
import type { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import { evidenceContainsFact } from "@/lib/ai/chat/evidence-match";

const URS_ID_RE = /\bURS-\d+\b/gi;

const DESCRIPTION_STOPWORDS = new Set([
  "also",
  "and",
  "are",
  "been",
  "control",
  "for",
  "from",
  "has",
  "have",
  "into",
  "its",
  "not",
  "only",
  "operation",
  "per",
  "purpose",
  "range",
  "requirement",
  "requirements",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "they",
  "this",
  "type",
  "user",
  "via",
  "was",
  "were",
  "with",
]);

const STAGE_ONLY_RE = /^(DQ|IQ|OQ|PQ)$/i;
const STOCK_REMARKS_RE = /\bcomplies\b|\bsection\s*13\b/i;
const PASS_TOKEN_RE =
  /\b(?:complies|complied|meet(?:s|ing)?|met|pass(?:ed|es)?|satisfactory|accepted|acceptable)\b/i;
const NOT_APPLICABLE_RE = /\b(?:n\/?a|not\s+applicable)\b/i;
const REVISION_CELL_RE = /^0?\d{1,2}$/;
const RPM_PARAMETER_RE = /\bagitator\b|\brpm\b/i;
const RANGE_PARAMETER_RE =
  /\bpressure\b|\bvacuum\b|\btemperature\b|\bagitator\b|\brpm\b/i;

export const QSR_RTM_SECTIONS = [
  "qsr_rtm_process",
  "qsr_rtm_control",
  "qsr_rtm_gmp",
  "qsr_rtm_safety",
  "qsr_rtm_csv",
  "qsr_rtm_maintenance",
] as const;

export const QSR_IDENTITY_TABLE_SECTIONS = [
  ...QSR_RTM_SECTIONS,
  "qsr_operating_range",
  "qsr_references",
  "qsr_qualification_documents",
] as const;

export type QsrRtmSection = (typeof QSR_RTM_SECTIONS)[number];
export type QualDocFamily = "urs" | "dq" | "iq" | "oq" | "pq" | "ds";

const FAMILY_FILENAME_NEEDLES: Record<QualDocFamily, readonly string[]> = {
  urs: ["urs", "user requirement"],
  dq: ["design qualification", "-dq", "dq-", " dq."],
  iq: ["installation qualification", "-iq", "iq-", " iq."],
  oq: ["operational qualification", "operation qualification", "-oq", "oq-"],
  pq: ["performance qualification", "-pq", "pq-"],
  ds: ["design specification", "design spec", "-ds", " ds."],
};

export function isQsrRtmSection(
  section: string | null | undefined
): section is QsrRtmSection {
  return (
    typeof section === "string" &&
    (QSR_RTM_SECTIONS as readonly string[]).includes(section)
  );
}

export function isQsrIdentityTableSection(
  section: string | null | undefined
): boolean {
  return (
    typeof section === "string" &&
    (QSR_IDENTITY_TABLE_SECTIONS as readonly string[]).includes(section)
  );
}

export function isUrsFilename(filename: string | null | undefined): boolean {
  if (!filename) return false;
  const n = filename.toLowerCase();
  return n.includes("urs") || n.includes("user requirement");
}

export function isQualIdentityFilename(
  filename: string | null | undefined
): boolean {
  if (!filename) return false;
  return documentFamilyFromFilename(filename) != null;
}

export function rowKeyFromContext(
  context: string | null | undefined
): string | null {
  if (!context) return null;
  URS_ID_RE.lastIndex = 0;
  const match = URS_ID_RE.exec(context);
  return match ? match[0].toUpperCase() : null;
}

export function factIsRowKey(fact: HardFact, key: string): boolean {
  return fact.kind === "identifier" && fact.normalized === key.toUpperCase();
}

const COLUMN_LABEL_GAP_MAX = 80;

type UrsSpan = { id: string; at: number };

function ursSpans(quote: string): UrsSpan[] {
  return [...quote.matchAll(/\bURS-\d+\b/gi)].map((match) => ({
    id: match[0]!.toUpperCase(),
    at: match.index ?? 0,
  }));
}

function isColumnLabelGap(gap: string): boolean {
  const body = gap.replace(/\s+/g, " ").trim();
  if (!body || body.length > COLUMN_LABEL_GAP_MAX) return false;
  return !/\d/.test(body);
}

/**
 * OCR of a two-column URS table is the ID list, then the requirement
 * sentences. That tail is not the last ID's own sentence.
 * Returns the index where the value column starts, or null when the page
 * is prose (each URS ID followed by its own text).
 */
export function columnRunValueStart(quote: string): number | null {
  const spans = ursSpans(quote);
  if (spans.length < 3) return null;
  let best: { start: number; end: number } | null = null;
  let runStart = 0;
  for (let i = 1; i <= spans.length; i++) {
    const continues =
      i < spans.length &&
      isColumnLabelGap(
        quote.slice(spans[i - 1]!.at + spans[i - 1]!.id.length, spans[i]!.at)
      );
    if (continues) continue;
    const runEnd = i - 1;
    if (runEnd - runStart >= 2) {
      if (!best || runEnd - runStart > best.end - best.start) {
        best = { start: runStart, end: runEnd };
      }
    }
    runStart = i;
  }
  if (!best) return null;
  const last = spans[best.end]!;
  const after = quote.slice(last.at + last.id.length);
  const label = /^([^0-9]{0,80})/.exec(after);
  return last.at + last.id.length + (label?.[1]?.length ?? 0);
}

/**
 * Slice of `quote` from this URS ID to the next URS ID (or 240 chars forward).
 * Same-page bag-of-quotes is not enough — URS-4 and URS-37 share a page.
 * Do not look behind the ID: the last URS on a page would otherwise steal
 * the previous row's range (`0 to 760 mmHg` sitting just before URS-36).
 * A two-column URS table (IDs, then the requirement text) stops before that
 * value column so the last ID does not own every sentence.
 */
export function quoteWindowAroundKey(quote: string, key: string): string | null {
  if (!quote.trim() || !key) return null;
  const needle = key.toUpperCase();
  const upper = quote.toUpperCase();
  const at = upper.indexOf(needle);
  if (at < 0) return null;
  const after = quote.slice(at + needle.length);
  const next = after.match(/\bURS-\d+\b/i);
  let end =
    next && next.index != null
      ? at + needle.length + next.index
      : Math.min(quote.length, at + needle.length + 240);
  const columnStart = columnRunValueStart(quote);
  if (columnStart != null && at < columnStart && end > columnStart) {
    end = columnStart;
  }
  if (end <= at) return null;
  return quote.slice(at, end);
}

export function evidenceContainsFactNearKey(
  haystack: string,
  fact: HardFact,
  key: string
): boolean {
  const window = quoteWindowAroundKey(haystack, key);
  return window != null && evidenceContainsFact(window, fact);
}

export function ursIdsInQuote(quote: string): string[] {
  return [
    ...new Set(
      [...quote.matchAll(/\bURS-\d+\b/gi)].map((match) => match[0]!.toUpperCase())
    ),
  ];
}

/**
 * Neighbour-URS leak only. A fact on the URS cover (Capacity 8000 L with no
 * URS-N nearby) may be copied onto the matching row; a value that sits inside
 * URS-37's window must not land on URS-5.
 */
export function factSupportedForRowKey(
  haystack: string,
  fact: HardFact,
  key: string
): boolean {
  if (evidenceContainsFactNearKey(haystack, fact, key)) return true;
  if (!evidenceContainsFact(haystack, fact)) return false;
  const needle = key.toUpperCase();
  return !ursIdsInQuote(haystack).some(
    (id) => id !== needle && evidenceContainsFactNearKey(haystack, fact, id)
  );
}

export function significantDescriptionTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(
      (token) =>
        token.length >= 4 &&
        !DESCRIPTION_STOPWORDS.has(token) &&
        !/^urs\d+$/.test(token)
    );
}

function windowHasToken(window: string, token: string): boolean {
  return normalizeHay(window).includes(token);
}

function normalizeHay(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}

function tokenHitsWindows(
  tokens: readonly string[],
  windows: readonly string[]
): number {
  return tokens.filter((token) =>
    windows.some((window) => windowHasToken(window, token))
  ).length;
}

function otherUrsWindows(
  quotes: readonly string[],
  key: string
): string[] {
  const needle = key.toUpperCase();
  const windows: string[] = [];
  for (const quote of quotes) {
    for (const id of ursIdsInQuote(quote)) {
      if (id === needle) continue;
      const window = quoteWindowAroundKey(quote, id);
      if (window) windows.push(window);
    }
  }
  return windows;
}

function tokensSupportedNearKey(
  tokens: readonly string[],
  quotes: readonly string[],
  key: string
): boolean {
  if (tokens.length === 0) return true;
  const targetWindows = quotes
    .map((quote) => quoteWindowAroundKey(quote, key))
    .filter((window): window is string => window != null);
  const targetHits = tokenHitsWindows(tokens, targetWindows);
  if (tokens.length === 1) {
    if (tokens[0]!.length >= 6 && targetHits === 1) return true;
  } else if (targetHits >= 2) {
    return true;
  }

  const otherHits = tokenHitsWindows(tokens, otherUrsWindows(quotes, key));
  const needed = tokens.length === 1 ? 1 : 2;
  if (targetHits === 0 && otherHits >= needed) return false;

  const pageWindows = quotes.filter((quote) => {
    const others = ursIdsInQuote(quote).filter(
      (id) => id !== key.toUpperCase()
    );
    if (others.length === 0) return true;
    return !others.some((id) => {
      const window = quoteWindowAroundKey(quote, id);
      return window != null && tokens.some((token) => windowHasToken(window, token));
    });
  });
  const pageHits = tokenHitsWindows(tokens, pageWindows);
  if (tokens.length === 1) return tokens[0]!.length >= 4 && pageHits === 1;
  return pageHits >= needed;
}

export function descriptionSupportedNearKey(
  cell: string,
  quotes: readonly string[],
  key: string
): boolean {
  const trimmed = cell.replace(/\[[^\]]+\]/g, "").trim();
  if (!trimmed) return true;
  if (STAGE_ONLY_RE.test(trimmed)) return true;
  if (new RegExp(`^${key}$`, "i").test(trimmed)) return true;
  const tokens = significantDescriptionTokens(trimmed);
  const alphaTokens = tokens.filter((token) => /[a-z]/.test(token));
  if (alphaTokens.length === 0) return true;
  return tokensSupportedNearKey(alphaTokens, quotes, key);
}

export function documentFamilyFromFilename(
  filename: string | null | undefined
): QualDocFamily | null {
  if (!filename) return null;
  const n = filename.toLowerCase();
  const order: QualDocFamily[] = ["urs", "dq", "iq", "oq", "pq", "ds"];
  for (const family of order) {
    if (FAMILY_FILENAME_NEEDLES[family].some((needle) => n.includes(needle))) {
      return family;
    }
  }
  return null;
}

export function documentFamilyFromContext(
  context: string | null | undefined
): QualDocFamily | null {
  if (!context) return null;
  const hay = context.toLowerCase();
  if (/\burs\b|user requirement/.test(hay)) return "urs";
  if (/\bdesign qualification\b|\bdq\b/.test(hay)) return "dq";
  if (/\binstallation qualification\b|\biq\b/.test(hay)) return "iq";
  if (/\boperational qualification\b|\boq\b/.test(hay)) return "oq";
  if (/\bperformance qualification\b|\bpq\b/.test(hay)) return "pq";
  if (/\bdesign spec/.test(hay)) return "ds";
  return documentFamilyFromFilename(context);
}

export function filenameMatchesFamily(
  filename: string | null | undefined,
  family: QualDocFamily
): boolean {
  return documentFamilyFromFilename(filename) === family;
}

export function stageFamilyFromCell(
  text: string | null | undefined
): QualDocFamily | null {
  const trimmed = text?.trim().toUpperCase() ?? "";
  switch (trimmed) {
    case "DQ":
      return "dq";
    case "IQ":
      return "iq";
    case "OQ":
      return "oq";
    case "PQ":
      return "pq";
    default:
      return null;
  }
}

function protocolPassWindow(
  ledger: CitationPageLedger,
  key: string,
  family: QualDocFamily
): string | null {
  for (const page of ledger.recordedPages()) {
    if (!filenameMatchesFamily(page.filename, family)) continue;
    const window = quoteWindowAroundKey(page.quote, key);
    if (!window) continue;
    if (NOT_APPLICABLE_RE.test(window)) continue;
    if (PASS_TOKEN_RE.test(window)) return window;
  }
  return null;
}

function protocolMentionsKey(
  ledger: CitationPageLedger,
  key: string,
  family: QualDocFamily
): boolean {
  return ledger.recordedPages().some((page) => {
    if (!filenameMatchesFamily(page.filename, family)) return false;
    return quoteWindowAroundKey(page.quote, key) != null;
  });
}

export function syntheticUnsupportedFact(text: string): HardFact {
  return {
    text,
    kind: "identifier",
    start: 0,
    end: text.length,
    normalized: text.replace(/\s+/g, " ").trim().toUpperCase(),
    cited: [],
  };
}

/** Remarks / stage cells that must not persist stock language. */
export function qsrRtmCellUnsupported(
  cell: string,
  context: string,
  ledger: CitationPageLedger
): HardFact | null {
  const key = rowKeyFromContext(context);
  const trimmed = cell.trim();
  if (!key || !trimmed) return null;

  if (STOCK_REMARKS_RE.test(trimmed)) {
    const stage = stageFamilyFromCell(rowStageFromContext(context));
    if (!stage || !protocolPassWindow(ledger, key, stage)) {
      return syntheticUnsupportedFact(trimmed);
    }
    return null;
  }

  const stage = stageFamilyFromCell(trimmed);
  if (stage && !protocolMentionsKey(ledger, key, stage)) {
    return syntheticUnsupportedFact(trimmed);
  }
  return null;
}

function rowStageFromContext(context: string): string {
  const match = context.match(/\b(DQ|IQ|OQ|PQ)\b/);
  return match?.[1] ?? "";
}

export function qsrOperatingRangeUnsupported(
  cell: string,
  context: string,
  ledger: CitationPageLedger
): HardFact | null {
  const trimmed = cell.trim();
  if (!trimmed || !RANGE_PARAMETER_RE.test(context)) return null;
  const quotes = ledger.recordedPages().map((page) => page.quote);
  if (RPM_PARAMETER_RE.test(context)) {
    const hasRpm = quotes.some((quote) =>
      /\b\d+(?:\.\d+)?\s*(?:±|\+\/-|plus\/minus)?\s*\d*\s*rpm\b/i.test(quote)
    );
    if (hasRpm && !/\brpm\b/i.test(trimmed) && !/\d/.test(trimmed)) {
      return syntheticUnsupportedFact(trimmed);
    }
  }
  return null;
}

export function qsrRevisionUnsupported(
  cell: string,
  context: string,
  section: string | undefined,
  ledger: CitationPageLedger
): HardFact | null {
  if (
    section !== "qsr_qualification_documents" &&
    section !== "qsr_references"
  ) {
    return null;
  }
  const trimmed = cell.trim();
  if (!REVISION_CELL_RE.test(trimmed)) return null;
  const family = documentFamilyFromContext(context);
  if (!family) return null;
  const onFamily = ledger.recordedPages().some(
    (page) =>
      filenameMatchesFamily(page.filename, family) &&
      page.quote.includes(trimmed)
  );
  return onFamily ? null : syntheticUnsupportedFact(trimmed);
}

export function qsrDescriptionUnsupported(
  cell: string,
  context: string,
  ledger: CitationPageLedger
): HardFact | null {
  const key = rowKeyFromContext(context);
  if (!key) return null;
  const stripped = cell.replace(/\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
  if (!stripped) return null;
  if (new RegExp(`^${key}$`, "i").test(stripped)) return null;
  if (/^<[^>]+>$/.test(stripped)) return null;
  const quotes = ledger.recordedPages().map((page) => page.quote);
  if (descriptionSupportedNearKey(cell, quotes, key)) return null;
  const preview = stripped.slice(0, 80);
  return preview ? syntheticUnsupportedFact(preview) : null;
}

export function extraQsrUnsupported(input: {
  cell: string;
  context: string;
  section?: string;
  ledger: CitationPageLedger;
}): HardFact[] {
  const out: HardFact[] = [];
  const seen = new Set<string>();
  const add = (fact: HardFact | null) => {
    if (!fact || seen.has(fact.normalized)) return;
    seen.add(fact.normalized);
    out.push(fact);
  };
  add(qsrRtmCellUnsupported(input.cell, input.context, input.ledger));
  if (input.section === "qsr_operating_range") {
    add(qsrOperatingRangeUnsupported(input.cell, input.context, input.ledger));
  }
  add(
    qsrRevisionUnsupported(
      input.cell,
      input.context,
      input.section,
      input.ledger
    )
  );
  add(qsrDescriptionUnsupported(input.cell, input.context, input.ledger));
  return out;
}

export function qsrFailClosedReason(input: {
  section?: string | null;
  attachedFilenames?: readonly string[];
  ledger: CitationPageLedger;
}): string | null {
  if (!isQsrIdentityTableSection(input.section)) return null;
  const attached = input.attachedFilenames ?? [];
  if (input.ledger.hasQuotedPages()) return null;

  const needsUrs =
    isQsrRtmSection(input.section) || input.section === "qsr_operating_range";
  if (needsUrs && attached.some((name) => isUrsFilename(name))) {
    return "The URS is attached but no URS page was retrieved this turn. Search or read the URS, then fill the row.";
  }
  if (
    (input.section === "qsr_qualification_documents" ||
      input.section === "qsr_references") &&
    attached.some((name) => isQualIdentityFilename(name))
  ) {
    return "A source protocol or URS is attached but no page from that file was retrieved this turn. Search or read it, then fill the row.";
  }
  return null;
}

export function rtmHeadingPhrases(
  section: string | null | undefined
): readonly string[] {
  switch (section) {
    case "qsr_rtm_process":
      return ["process requirements", "user requirement"];
    case "qsr_rtm_control":
      return ["control philosophy"];
    case "qsr_rtm_gmp":
      return ["gmp requirements"];
    case "qsr_rtm_safety":
      return ["safety requirements"];
    case "qsr_rtm_csv":
      return ["computer system validation", "scada"];
    case "qsr_rtm_maintenance":
      return ["maintenance and cleaning", "contamination"];
    default:
      return [];
  }
}
