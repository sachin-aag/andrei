import { requirementIds } from "@/lib/attachments/ocr-quality";

const PAGE_LOCATOR_RE = /\b(?:page|p\.?)\s*\d+\b/i;
const FILE_LOCATOR_RE = /\.(pdf|docx)\b/i;
const LEXICAL_TOKEN_RE = /[A-Za-z0-9]/;

export type RetrievalQueryKind = "identifier" | "locator" | "semantic";

export type ClassifiedRetrievalQuery = {
  kind: RetrievalQueryKind;
  identifiers: string[];
};

export function classifyRetrievalQuery(query: string): ClassifiedRetrievalQuery {
  const trimmed = query.replace(/\s+/g, " ").trim();
  const identifiers = requirementIds(trimmed);
  if (identifiers.length > 0) {
    return { kind: "identifier", identifiers };
  }
  if (PAGE_LOCATOR_RE.test(trimmed) || FILE_LOCATOR_RE.test(trimmed)) {
    return { kind: "locator", identifiers: [] };
  }
  return { kind: "semantic", identifiers: [] };
}

export function searchPageKey(attachmentId: string, pageNumber: number): string {
  return `${attachmentId}:${pageNumber}`;
}

export function requestedPageNumbers(query: string): number[] {
  const pages: number[] = [];
  const matches = query.matchAll(/\b(?:page|p\.?)\s*(\d+)\b/gi);
  for (const match of matches) {
    const value = Number(match[1]);
    if (Number.isInteger(value) && value > 0 && value < 10_000) {
      pages.push(value);
    }
  }
  return [...new Set(pages)];
}

export function requestedFilenames(query: string): string[] {
  return [...query.matchAll(/\b[\w.-]+\.(?:pdf|docx)\b/gi)].map(
    (match) => match[0]
  );
}

export function locatorHitBoost(
  hit: { filename: string; pageNumber: number },
  query: string
): number {
  const files = requestedFilenames(query);
  const pages = requestedPageNumbers(query);
  let boost = 0;
  if (
    files.some((name) => name.toLowerCase() === hit.filename.toLowerCase())
  ) {
    boost += 2;
  }
  if (pages.includes(hit.pageNumber)) boost += 1;
  return boost;
}

/** Locator queries name a file and/or page — those hits belong first. */
export function rankHitsForQuery<
  T extends { filename: string; pageNumber: number },
>(rows: readonly T[], query: string): T[] {
  if (classifyRetrievalQuery(query).kind !== "locator") {
    return [...rows];
  }
  if (
    requestedPageNumbers(query).length === 0 &&
    requestedFilenames(query).length === 0
  ) {
    return [...rows];
  }
  return [...rows].sort(
    (left, right) =>
      locatorHitBoost(right, query) - locatorHitBoost(left, query)
  );
}

function chunkSourceKind(row: unknown): string | undefined {
  if (typeof row !== "object" || row === null || !("sourceKind" in row)) {
    return undefined;
  }
  const kind = (row as { sourceKind?: unknown }).sourceKind;
  return typeof kind === "string" ? kind : undefined;
}

/**
 * Quote/transcript chunks are the page text. Visual-interpretation chunks are
 * Gemini layout summaries and must not win the per-page excerpt when a quote
 * exists (they match query wording without naming table rows).
 */
export function preferTranscriptChunks<T>(rows: readonly T[]): T[] {
  const transcript = rows.filter(
    (row) => chunkSourceKind(row) !== "visual_interpretation"
  );
  return transcript.length > 0 ? [...transcript] : [...rows];
}

/** Searchable tokens for lexical excerpt centering and chunk scoring. */
export function lexicalQueryTokens(query: string): string[] {
  return query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && LEXICAL_TOKEN_RE.test(token));
}

/**
 * Higher = better lexical overlap between chunk text and the query. Used to pick
 * the winning chunk per page and to decide whether a lexical-only pass can
 * skip the query embedding.
 */
export function lexicalMatchScore(text: string, query: string): number {
  const haystack = text.replace(/\s+/g, " ").toLowerCase();
  const phrase = query.replace(/\s+/g, " ").trim().toLowerCase();
  if (!phrase) return 0;

  let score = 0;
  if (haystack.includes(phrase)) {
    score += 1000 + phrase.length;
  }

  for (const token of lexicalQueryTokens(query)) {
    const lower = token.toLowerCase();
    if (haystack.includes(lower)) {
      score += 10 + Math.min(lower.length, 20);
    }
  }
  return score;
}

type ChunkTextRow = {
  contextualText?: string;
  rawText?: string;
};

function chunkTextForScoring(row: ChunkTextRow): string {
  return row.contextualText || row.rawText || "";
}

/** Drop filename / page-N tokens so locator queries can still excerpt page body. */
export function contentQueryForSnippet(query: string): string {
  return query
    .replace(/\b[\w.-]+\.(?:pdf|docx)\b/gi, " ")
    .replace(/\b(?:page|p\.?)\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build a search excerpt centered on the query match instead of always taking
 * the first `maxChars` characters (which hides table rows below repeated headers).
 * Filename/page locators with no remaining content terms use the page tail so
 * a running header does not fill the window.
 */
export function buildMatchCenteredSnippet(
  text: string,
  query: string,
  maxChars = 900
): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;

  const contentQuery = contentQueryForSnippet(query);
  if (!contentQuery) {
    return `…${cleaned.slice(-maxChars).trimStart()}`;
  }

  const phrase = contentQuery;
  const lower = cleaned.toLowerCase();
  const lowerPhrase = phrase.toLowerCase();

  let matchIndex = lowerPhrase.length > 0 ? lower.indexOf(lowerPhrase) : -1;
  let matchLength = lowerPhrase.length;

  if (matchIndex < 0) {
    const tokens = [...lexicalQueryTokens(contentQuery)].sort(
      (left, right) => right.length - left.length
    );
    for (const token of tokens) {
      const index = lower.indexOf(token.toLowerCase());
      if (index >= 0) {
        matchIndex = index;
        matchLength = token.length;
        break;
      }
    }
  }

  if (matchIndex < 0) {
    return `${cleaned.slice(0, maxChars).trimEnd()}...`;
  }

  const matchEnd = matchIndex + matchLength;
  const halfWindow = Math.floor(maxChars / 2);
  let start = Math.max(0, matchIndex - halfWindow);
  let end = Math.min(cleaned.length, start + maxChars);
  if (end - start < maxChars) {
    start = Math.max(0, end - maxChars);
  }
  // Keep the matched span inside the window when possible.
  if (matchEnd > end) {
    end = Math.min(cleaned.length, matchEnd + Math.floor(maxChars * 0.15));
    start = Math.max(0, end - maxChars);
  }
  if (matchIndex < start) {
    start = Math.max(0, matchIndex - Math.floor(maxChars * 0.15));
    end = Math.min(cleaned.length, start + maxChars);
  }

  let snippet = cleaned.slice(start, end).trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < cleaned.length) snippet = `${snippet}…`;
  return snippet;
}

export type CollapseToBestChunkOptions<T> = {
  query?: string;
  textFrom?: (row: T) => string;
};

/**
 * One result per `(attachmentId, pageNumber)`. When `query` is set, keep the
 * chunk whose text best matches the query; otherwise keep the first seen chunk
 * (legacy ordering).
 */
export function collapseToBestChunkPerPage<
  T extends { attachmentId: string; pageNumber: number },
>(rows: readonly T[], opts: CollapseToBestChunkOptions<T> = {}): T[] {
  const query = opts.query?.replace(/\s+/g, " ").trim();
  if (!query) {
    const seen = new Set<string>();
    const collapsed: T[] = [];
    const preferred = preferTranscriptChunks(rows);
    for (const row of preferred) {
      const key = searchPageKey(row.attachmentId, row.pageNumber);
      if (seen.has(key)) continue;
      seen.add(key);
      collapsed.push(row);
    }
    return collapsed;
  }

  const textFrom = opts.textFrom ?? ((row) => chunkTextForScoring(row as ChunkTextRow));
  const bestByPage = new Map<
    string,
    { row: T; score: number; minIndex: number; members: T[] }
  >();
  rows.forEach((row, index) => {
    const key = searchPageKey(row.attachmentId, row.pageNumber);
    const existing = bestByPage.get(key);
    if (!existing) {
      bestByPage.set(key, { row, score: 0, minIndex: index, members: [row] });
      return;
    }
    existing.minIndex = Math.min(existing.minIndex, index);
    existing.members.push(row);
  });

  for (const entry of bestByPage.values()) {
    const preferred = preferTranscriptChunks(entry.members);
    let best = preferred[0]!;
    let bestScore = lexicalMatchScore(textFrom(best), query);
    for (const row of preferred.slice(1)) {
      const score = lexicalMatchScore(textFrom(row), query);
      if (score > bestScore) {
        best = row;
        bestScore = score;
      }
    }
    entry.row = best;
    entry.score = bestScore;
  }

  return Array.from(bestByPage.values())
    .sort((left, right) => left.minIndex - right.minIndex)
    .map((entry) => entry.row);
}
