import type { JSONContent } from "@tiptap/core";
import type { HardFact } from "@/lib/ai/chat/claim-facts";
import type { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import { evidenceContainsFact } from "@/lib/ai/chat/evidence-match";
import { QSR_TABLE_HEADERS } from "@/lib/document-types/qsr/sections";
import { collectPlaceholderSpans } from "@/lib/placeholders/find";
import {
  summarizeTablesInDoc,
  type TableCellEdit,
  type TableOperation,
} from "@/lib/suggestions/table-operation";

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
const STOCK_COMPLIES_RE = /\bcomplies\b/i;
const STOCK_BARE_SECTION_13_RE = /^section\s*13$/i;
const PASS_WORD_CELL_RE = /^(?:complies|verified)$/i;
const SECTION_NUMBER_CELL_RE = /^(?:section\s+)?\d+(?:\.\d+)+$/i;
const PASS_TOKEN_RE =
  /\b(?:complies|complied|meet(?:s|ing)?|met|pass(?:ed|es)?|satisfactory|accepted|acceptable|verified)\b/i;
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

/** Highest remaining-column Stage first. Single cell — not a compound list. */
export const QSR_STAGE_RANK = ["pq", "oq", "iq", "dq"] as const;
export type RtmStageFamily = (typeof QSR_STAGE_RANK)[number];

const STAGE_LABEL: Record<RtmStageFamily, "PQ" | "OQ" | "IQ" | "DQ"> = {
  pq: "PQ",
  oq: "OQ",
  iq: "IQ",
  dq: "DQ",
};

export type RtmReferencePick = {
  family: RtmStageFamily;
  stageLabel: "PQ" | "OQ" | "IQ" | "DQ";
  filename: string;
  pageNumber: number;
  sectionHeading: string | null;
  remarks: string;
};

const FAMILY_FILENAME_NEEDLES: Record<QualDocFamily, readonly string[]> = {
  urs: ["urs", "user requirement"],
  dq: ["design qualification", "-dq", "dq-", " dq.", "dqp"],
  iq: ["installation qualification", "-iq", "iq-", " iq.", "iqp"],
  oq: ["operational qualification", "operation qualification", "-oq", "oq-", "oqp"],
  pq: ["performance qualification", "-pq", "pq-", "pqp"],
  ds: ["design specification", "design spec", "-ds", " ds."],
};

/** Running-header chrome that repeats on every DQ/IQ/OQ/PQ page. */
const PROTOCOL_RUNNING_HEADER_RES: readonly RegExp[] = [
  // Unlabeled equipment name immediately before Capacity/Size (IQ p.1 starts
  // "Glass Lined Reactor Capacity/Size …" then repeats it after the label).
  /(?:^|\n)\s*[a-z][a-z0-9 ]{2,60}(?=\s+(?:capacity\s*\/\s*size|dqp\s*\/|iqp\s*\/|oqp\s*\/|pqp\s*\/))/gi,
  /uncontrolled copy/gi,
  /page\s+\d+\s+of\s+\d+/gi,
  /capacity\s*\/\s*size[:\s]*[0-9.,]+\s*l?/gi,
  /\b(?:dqp|iqp|oqp|pqp)\s*\/\s*[a-z0-9-]+/gi,
  /equipment name[:\s]+[a-z0-9 ]{0,48}/gi,
  /equipment id[:\s]+[a-z0-9-]+/gi,
  /document no\.?[:\s]*[a-z0-9/-]+/gi,
  /format\.?\s*no[:\s.-]*[a-z0-9/-]+/gi,
];

export function isQsrRtmSection(
  section: string | null | undefined
): section is QsrRtmSection {
  return (
    typeof section === "string" &&
    (QSR_RTM_SECTIONS as readonly string[]).includes(section)
  );
}

/** Stage / Section / Remarks may empty instead of failing the URS copy. */
export function isQsrRtmOptionalReferenceColumn(
  section: string | null | undefined,
  col: number
): boolean {
  if (!isQsrRtmSection(section)) return false;
  const header = QSR_TABLE_HEADERS[section][col];
  if (!header) return false;
  const name = header.toLowerCase();
  return (
    name.includes("qualification stage") ||
    (name.includes("reference") && name.includes("section")) ||
    name === "remarks"
  );
}

export function rtmReferenceColumnIndexes(
  section: string | null | undefined
): { stage: number; section: number; remarks: number } | null {
  if (!isQsrRtmSection(section)) return null;
  const headers = QSR_TABLE_HEADERS[section];
  let stage = -1;
  let sectionCol = -1;
  let remarks = -1;
  for (let i = 0; i < headers.length; i++) {
    const name = headers[i]!.toLowerCase();
    if (name.includes("qualification stage")) stage = i;
    else if (name.includes("reference") && name.includes("section")) {
      sectionCol = i;
    } else if (name === "remarks") remarks = i;
  }
  if (stage < 0 || sectionCol < 0 || remarks < 0) return null;
  return { stage, section: sectionCol, remarks };
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

/** Group `edit_cells` by URS rowKey, not a reused dummy numeric `row`. */
export function editCellsGroupKey(cell: TableCellEdit): string {
  const explicit = cell.rowKey?.replace(/\s+/g, " ").trim();
  if (explicit) return explicit.toUpperCase();
  return (
    rowKeyFromContext(
      [cell.rowContext, cell.insertText, cell.expectedText]
        .filter((part): part is string => Boolean(part?.trim()))
        .join("\n")
    ) ?? `__row:${cell.row}`
  );
}

function editCellsSiblingContext(
  siblings: readonly TableCellEdit[],
  key: string
): string {
  return [
    key.startsWith("__row:") ? "" : key,
    ...siblings.flatMap((sib) => [
      sib.rowKey,
      sib.insertText,
      sib.expectedText,
      sib.rowContext,
    ]),
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n");
}

function mergeRowContextLines(
  live: string,
  existing: string | undefined
): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const part of [live, existing ?? ""]) {
    for (const line of part.split("\n")) {
      const trimmed = line.replace(/\s+/g, " ").trim();
      if (!trimmed) continue;
      const id = trimmed.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      lines.push(trimmed);
    }
  }
  return lines.join("\n");
}

/** First-cell → live Parameters / User requirements for that URS row. */
export function liveTableRowContextByKey(
  fieldDoc: JSONContent | null | undefined
): Map<string, string> {
  const map = new Map<string, string>();
  if (!fieldDoc) return map;
  for (const table of summarizeTablesInDoc(fieldDoc)) {
    const byRow = new Map<number, string[]>();
    for (const cell of table.cells) {
      if (cell.row === 0) continue;
      const text = cell.text === "(empty)" ? "" : cell.text.trim();
      const list = byRow.get(cell.row) ?? [];
      list[cell.col] = text;
      byRow.set(cell.row, list);
    }
    for (const cells of byRow.values()) {
      const first = (cells[0] ?? "").replace(/\s+/g, " ").trim();
      if (!first) continue;
      const lines = cells.filter((part) => Boolean(part?.trim()));
      if (lines.length === 0) continue;
      map.set(first.toUpperCase(), lines.join("\n"));
    }
  }
  return map;
}

/**
 * Topic-match protocol pages from the live table even when the model
 * stuffed `rowContext` with only URS-N / IQ / Complies.
 */
export function attachLiveTableRowContext(
  operation: TableOperation,
  fieldDoc: JSONContent | null | undefined
): TableOperation {
  if (operation.kind !== "edit_cells") return operation;
  const live = liveTableRowContextByKey(fieldDoc);
  if (live.size === 0) return operation;
  return {
    ...operation,
    cells: operation.cells.map((cell) => {
      const snapshot = live.get(editCellsGroupKey(cell));
      if (!snapshot) return cell;
      const merged = mergeRowContextLines(snapshot, cell.rowContext);
      if (merged === (cell.rowContext ?? "").trim()) return cell;
      return { ...cell, rowContext: merged };
    }),
  };
}

/** Angle-bracket RTM tokens, including `<section>` (HTML-tag skip in live scan). */
export function isQsrRtmPlaceholderText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^<[^<>]+>$/.test(trimmed)) return true;
  return collectPlaceholderSpans(trimmed).length > 0;
}

/** Drop leftover Stage / Section / Remarks placeholders so they never persist. */
export function dropQsrRtmPlaceholderCells(
  operation: TableOperation,
  section?: string | null
): TableOperation {
  const cols = rtmReferenceColumnIndexes(section);
  if (!cols) return operation;
  switch (operation.kind) {
    case "edit_cells":
      return {
        ...operation,
        cells: operation.cells.filter((cell) => {
          if (!isQsrRtmOptionalReferenceColumn(section, cell.col)) return true;
          return !isQsrRtmPlaceholderText(cell.insertText);
        }),
      };
    case "insert_rows":
      return {
        ...operation,
        rows: operation.rows.map((row) => {
          const next = [...row];
          for (const col of [cols.stage, cols.section, cols.remarks]) {
            const value = next[col] ?? "";
            if (isQsrRtmPlaceholderText(value)) next[col] = "";
          }
          return next;
        }),
      };
    case "create_table":
    case "insert_column":
    case "delete_rows":
    case "delete_column":
    case "delete_table":
      return operation;
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
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

type ColumnRun = {
  ids: string[];
  firstAt: number;
  lastAt: number;
  /** Index just after the last ID. The parameter name and the requirement
   * sentences that follow are shared by every ID in the run. */
  valueStart: number;
};

/**
 * OCR of a two-column URS table is the ID list, then the requirement
 * sentences. A page can have more than one block (URS-13–20, then URS-21–29).
 * A digit in the gap ends the block, so the values are not the last ID's sentence.
 */
function columnRuns(quote: string): ColumnRun[] {
  const spans = ursSpans(quote);
  const runs: ColumnRun[] = [];
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
      const last = spans[runEnd]!;
      runs.push({
        ids: spans.slice(runStart, runEnd + 1).map((span) => span.id),
        firstAt: spans[runStart]!.at,
        lastAt: last.at,
        valueStart: last.at + last.id.length,
      });
    }
    runStart = i;
  }
  return runs;
}

function columnValueStartForSpan(quote: string, at: number): number | null {
  for (const run of columnRuns(quote)) {
    if (at >= run.firstAt && at <= run.lastAt) return run.valueStart;
  }
  return null;
}

/**
 * Value-column start of the longest ID run, or null when the page is prose
 * (each URS ID followed by its own text).
 */
export function columnRunValueStart(quote: string): number | null {
  let best: ColumnRun | null = null;
  for (const run of columnRuns(quote)) {
    if (!best || run.ids.length > best.ids.length) best = run;
  }
  return best?.valueStart ?? null;
}

function indexOfUrsId(quote: string, key: string): number {
  const needle = key.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${needle}\\b`, "i").exec(quote);
  return match?.index ?? -1;
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
  const at = indexOfUrsId(quote, key);
  if (at < 0) return null;
  const needle = key.toUpperCase();
  const after = quote.slice(at + needle.length);
  const next = after.match(/\bURS-\d+\b/i);
  let end =
    next && next.index != null
      ? at + needle.length + next.index
      : Math.min(quote.length, at + needle.length + 240);
  const columnStart = columnValueStartForSpan(quote, at);
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

function textOutsideOtherUrsWindows(quote: string, key: string): string {
  const needle = key.toUpperCase();
  const ranges: Array<{ start: number; end: number }> = [];
  for (const id of ursIdsInQuote(quote)) {
    if (id === needle) continue;
    const start = indexOfUrsId(quote, id);
    if (start < 0) continue;
    const window = quoteWindowAroundKey(quote, id);
    if (!window) continue;
    ranges.push({ start, end: start + window.length });
  }
  ranges.sort((a, b) => b.start - a.start);
  let text = quote;
  for (const range of ranges) {
    text = `${text.slice(0, range.start)}${" ".repeat(range.end - range.start)}${text.slice(range.end)}`;
  }
  return text;
}

/** Requirement sentences that sit outside every other URS window on a page
 * that names this ID (or on a cover with no URS ID). */
function unownedTokenHits(
  tokens: readonly string[],
  quotes: readonly string[],
  key: string
): number {
  const haystacks: string[] = [];
  for (const quote of quotes) {
    if (indexOfUrsId(quote, key) >= 0) {
      haystacks.push(textOutsideOtherUrsWindows(quote, key));
    } else if (ursIdsInQuote(quote).length === 0) {
      haystacks.push(quote);
    }
  }
  return tokenHitsWindows(tokens, haystacks);
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

  const unownedHits = unownedTokenHits(tokens, quotes, key);
  if (tokens.length === 1) {
    if (tokens[0]!.length >= 4 && unownedHits >= 1) return true;
  } else if (unownedHits >= 2) {
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
  if (PASS_WORD_CELL_RE.test(trimmed)) return true;
  if (SECTION_NUMBER_CELL_RE.test(trimmed)) return true;
  if (new RegExp(`^${key}$`, "i").test(trimmed)) return true;
  const tokens = significantDescriptionTokens(trimmed);
  const alphaTokens = tokens.filter((token) => /[a-z]/.test(token));
  if (alphaTokens.length === 0) return true;
  return tokensSupportedNearKey(alphaTokens, quotes, key);
}

/** Protocol body after stripping running-header chrome (Capacity/Size, IQP/…). */
export function protocolBodyQuote(quote: string): string {
  let text = quote;
  for (const re of PROTOCOL_RUNNING_HEADER_RES) {
    re.lastIndex = 0;
    text = text.replace(re, " ");
  }
  return text.replace(/\s+/g, " ").trim();
}

function protocolTopicTokens(context: string): string[] {
  const withoutMeta = context
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b[\w.-]+\.(?:pdf|docx?|xlsx?)\b/gi, " ")
    .replace(/\bURS-\d+\b/gi, " ")
    .replace(/\b(?:DQ|IQ|OQ|PQ)\b/g, " ")
    .replace(STOCK_COMPLIES_RE, " ")
    .replace(/\bsection\s+\d+(?:\.\d+)*\b/gi, " ");
  return withoutMeta
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(
      (token) =>
        token.length >= 3 &&
        !DESCRIPTION_STOPWORDS.has(token) &&
        !/^\d+$/.test(token) &&
        !/^urs\d+$/.test(token) &&
        !/^(?:pdf|docx?|xlsx?)$/.test(token)
    );
}

function isRtmReferenceMetaLine(line: string): boolean {
  const stripped = line.replace(/\[[^\]]*\]/g, "").trim();
  if (!stripped) return true;
  if (/^<[^<>]+>$/.test(stripped)) return true;
  if (/^URS-\d+$/i.test(stripped)) return true;
  if (STAGE_ONLY_RE.test(stripped)) return true;
  if (PASS_WORD_CELL_RE.test(stripped)) return true;
  if (STOCK_BARE_SECTION_13_RE.test(stripped)) return true;
  if (SECTION_NUMBER_CELL_RE.test(stripped)) return true;
  return false;
}

/**
 * Prefer User requirements / Purpose over a short Parameters label so
 * `MOC` cannot topic-match a neighbour protocol row by itself.
 * Two short tokens ("Limpet/Plain") are not enough — join sibling lines
 * so Jacket Type + Limpet can match an IQ result together.
 */
function protocolTopicSource(context: string): string {
  const lines = context
    .split(/\n/)
    .map((line) => line.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line && !isRtmReferenceMetaLine(line));
  if (lines.length === 0) return context;
  const longest = lines.reduce((best, line) =>
    line.length >= best.length ? line : best
  );
  const tokens = protocolTopicTokens(longest);
  if (tokens.some((token) => token.length >= 8)) {
    return longest;
  }
  return lines.join(" ");
}

function protocolTopicBody(quote: string, context: string): string | null {
  const body = protocolBodyQuote(quote);
  const tokens = protocolTopicTokens(protocolTopicSource(context));
  if (tokens.length === 0 || !body) return null;
  const hits = tokens.filter((token) => windowHasToken(body, token));
  if (hits.length >= 2) return body;
  if (hits.length === 1 && hits[0]!.length >= 8) return body;
  return null;
}

function hasProtocolPassToken(text: string): boolean {
  const hay = text.replace(/\bverified\s+by\b/gi, " ");
  if (NOT_APPLICABLE_RE.test(hay)) return false;
  return PASS_TOKEN_RE.test(hay);
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
  if (/\bdesign qualification\b|\bdqp\b|\bdq\b/.test(hay)) return "dq";
  if (/\binstallation qualification\b|\biqp\b|\biq\b/.test(hay)) return "iq";
  if (/\boperational qualification\b|\boqp\b|\boq\b/.test(hay)) return "oq";
  if (/\bperformance qualification\b|\bpqp\b|\bpq\b/.test(hay)) return "pq";
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
  const trimmed = text?.replace(/\[[^\]]*\]/g, "").trim().toUpperCase() ?? "";
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
  family: QualDocFamily,
  context: string
): string | null {
  for (const page of ledger.recordedPages()) {
    if (!filenameMatchesFamily(page.filename, family)) continue;
    const window = quoteWindowAroundKey(page.quote, key);
    if (window) {
      if (hasProtocolPassToken(window)) return window;
      continue;
    }
    const topic = protocolTopicBody(page.quote, context);
    if (topic && hasProtocolPassToken(topic)) return topic;
  }
  return null;
}

function protocolMentionsKey(
  ledger: CitationPageLedger,
  key: string,
  family: QualDocFamily,
  context: string
): boolean {
  return ledger.recordedPages().some((page) => {
    if (!filenameMatchesFamily(page.filename, family)) return false;
    if (quoteWindowAroundKey(page.quote, key) != null) return true;
    return protocolTopicBody(page.quote, context) != null;
  });
}

function protocolSectionHeading(body: string): string | null {
  const stripped = protocolBodyQuote(body);
  const multi = stripped.match(/(?:^|[\s])(\d+(?:\.\d+){2,4})\.?(?:\s|$)/);
  if (multi?.[1]) return multi[1];
  const titled = stripped.match(/(?:^|[\s])(\d+\.\d+)\.?\s+[A-Z]/);
  if (titled?.[1]) return titled[1];
  const labeled = stripped.match(/\bsection\s+(\d+(?:\.\d+)*)/i);
  return labeled?.[1] ?? null;
}

function matchingProtocolPages(
  ledger: CitationPageLedger,
  key: string,
  family: RtmStageFamily,
  context: string
) {
  return ledger.recordedPages().filter((page) => {
    if (!filenameMatchesFamily(page.filename, family)) return false;
    if (quoteWindowAroundKey(page.quote, key) != null) return true;
    return protocolTopicBody(page.quote, context) != null;
  });
}

function formatRtmStageCell(pick: RtmReferencePick): string {
  return `${pick.stageLabel} [${pick.filename}, p. ${pick.pageNumber}]`;
}

export function pickRtmReference(
  ledger: CitationPageLedger,
  key: string,
  context: string
): RtmReferencePick | null {
  for (const family of QSR_STAGE_RANK) {
    const pages = matchingProtocolPages(ledger, key, family, context);
    if (pages.length === 0) continue;
    const passPage =
      pages.find((page) => {
        const window = quoteWindowAroundKey(page.quote, key);
        if (window && hasProtocolPassToken(window)) return true;
        const topic = protocolTopicBody(page.quote, context);
        return topic != null && hasProtocolPassToken(topic);
      }) ?? pages[0]!;
    const body =
      protocolTopicBody(passPage.quote, context) ??
      quoteWindowAroundKey(passPage.quote, key) ??
      protocolBodyQuote(passPage.quote);
    return {
      family,
      stageLabel: STAGE_LABEL[family],
      filename: passPage.filename,
      pageNumber: passPage.pageNumber,
      sectionHeading: body ? protocolSectionHeading(body) : null,
      remarks: protocolPassWindow(ledger, key, family, context)
        ? "Complies"
        : "",
    };
  }
  return null;
}

function rowTouchesReference(
  row: readonly string[],
  cols: { stage: number; section: number; remarks: number }
): boolean {
  return [cols.stage, cols.section, cols.remarks].some(
    (col) => (row[col] ?? "").trim().length > 0
  );
}

function applyPickToRow(
  row: readonly string[],
  cols: { stage: number; section: number; remarks: number },
  pick: RtmReferencePick | null
): string[] {
  if (!rowTouchesReference(row, cols)) return [...row];
  const next = [...row];
  const last = Math.max(cols.stage, cols.section, cols.remarks);
  while (next.length <= last) next.push("");
  if (!pick) {
    next[cols.stage] = "";
    next[cols.section] = "";
    next[cols.remarks] = "";
    return next;
  }
  next[cols.stage] = formatRtmStageCell(pick);
  next[cols.section] = pick.sectionHeading ?? "";
  next[cols.remarks] = pick.remarks;
  return next;
}

function rankEditCells(
  operation: Extract<TableOperation, { kind: "edit_cells" }>,
  ledger: CitationPageLedger,
  section: string | undefined,
  cols: { stage: number; section: number; remarks: number }
): TableOperation {
  const byKey = new Map<string, TableCellEdit[]>();
  for (const cell of operation.cells) {
    const key = editCellsGroupKey(cell);
    const list = byKey.get(key) ?? [];
    list.push(cell);
    byKey.set(key, list);
  }
  const rewritten = operation.cells.map((cell) => {
    const key = editCellsGroupKey(cell);
    const siblings = byKey.get(key) ?? [];
    const touchesRef = siblings.some((sib) =>
      isQsrRtmOptionalReferenceColumn(section, sib.col)
    );
    if (!touchesRef) return cell;
    if (!isQsrRtmOptionalReferenceColumn(section, cell.col)) return cell;
    const context = editCellsSiblingContext(siblings, key);
    const rowKey = key.startsWith("__row:")
      ? rowKeyFromContext(context)
      : key;
    if (!rowKey) return cell;
    const pick = pickRtmReference(ledger, rowKey, context);
    if (!pick) return cell;
    if (cell.col === cols.stage) {
      return { ...cell, insertText: formatRtmStageCell(pick) };
    }
    if (cell.col === cols.section) {
      return { ...cell, insertText: pick.sectionHeading ?? "" };
    }
    if (cell.col === cols.remarks) {
      return { ...cell, insertText: pick.remarks };
    }
    return cell;
  });
  const present = new Set(
    rewritten.map((cell) => `${editCellsGroupKey(cell)}:${cell.col}`)
  );
  const extra: TableCellEdit[] = [];
  for (const [key, siblings] of byKey) {
    if (key.startsWith("__row:")) continue;
    const touchesRef = siblings.some((sib) =>
      isQsrRtmOptionalReferenceColumn(section, sib.col)
    );
    if (!touchesRef) continue;
    const context = editCellsSiblingContext(siblings, key);
    const pick = pickRtmReference(ledger, key, context);
    if (!pick) continue;
    const template = siblings[0]!;
    const add = (col: number, insertText: string) => {
      if (!insertText.trim()) return;
      if (present.has(`${key}:${col}`)) return;
      present.add(`${key}:${col}`);
      extra.push({
        row: template.row,
        col,
        rowKey: template.rowKey ?? key,
        expectedText: "",
        insertText,
        ...(template.rowContext ? { rowContext: template.rowContext } : {}),
      });
    };
    add(cols.stage, formatRtmStageCell(pick));
    add(cols.section, pick.sectionHeading ?? "");
    add(cols.remarks, pick.remarks);
  }
  return {
    ...operation,
    cells: extra.length > 0 ? [...rewritten, ...extra] : rewritten,
  };
}

/** Rewrite Stage / Section / Remarks to the highest matching family. */
export function rankRtmReferenceOperation(
  operation: TableOperation,
  ledger: CitationPageLedger,
  section?: string
): TableOperation {
  const cols = rtmReferenceColumnIndexes(section);
  if (!cols) return operation;
  switch (operation.kind) {
    case "insert_rows":
      return {
        ...operation,
        rows: operation.rows.map((row) => {
          const context = row.join("\n");
          const key = rowKeyFromContext(context);
          if (!key) return row;
          return applyPickToRow(
            row,
            cols,
            pickRtmReference(ledger, key, context)
          );
        }),
      };
    case "create_table":
      return {
        ...operation,
        rows: operation.rows?.map((row) => {
          const context = [...operation.headers, ...row].join("\n");
          const key = rowKeyFromContext(context);
          if (!key) return row;
          return applyPickToRow(
            row,
            cols,
            pickRtmReference(ledger, key, context)
          );
        }),
      };
    case "edit_cells":
      return rankEditCells(operation, ledger, section, cols);
    case "insert_column":
    case "delete_rows":
    case "delete_column":
    case "delete_table":
      return operation;
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
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

  if (STOCK_BARE_SECTION_13_RE.test(trimmed)) {
    return syntheticUnsupportedFact(trimmed);
  }

  if (STOCK_COMPLIES_RE.test(trimmed)) {
    const stage = stageFamilyFromCell(rowStageFromContext(context));
    if (!stage || !protocolPassWindow(ledger, key, stage, context)) {
      return syntheticUnsupportedFact(trimmed);
    }
    return null;
  }

  const stage = stageFamilyFromCell(trimmed);
  if (stage && !protocolMentionsKey(ledger, key, stage, context)) {
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
