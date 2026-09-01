import { embed, type EmbeddingModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { and, desc, eq, inArray, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attachmentIngestRuns,
  documentChunks,
  documentOutlineSpans,
  documentPages,
  reportAttachments,
} from "@/db/schema";
import { createWifAuthClient, getWifConfig } from "@/lib/gcp/wif-token";
import {
  buildOutlineFromStoredPages,
  type OutlineSpan,
} from "@/lib/attachments/page-outline";
import {
  classifyRetrievalQuery,
  collapseToBestChunkPerPage,
  searchPageKey,
  type RetrievalQueryKind,
} from "@/lib/attachments/retrieval-query";
import { rewriteChunkDocumentHeader } from "@/lib/attachments/chunk-pages";

export { buildOutlineFromStoredPages };
export {
  classifyRetrievalQuery,
  collapseToBestChunkPerPage,
  searchPageKey,
};
export type { RetrievalQueryKind } from "@/lib/attachments/retrieval-query";

type GoogleAuthOptions = NonNullable<Parameters<typeof createVertex>[0]>["googleAuthOptions"];
type AuthClient = NonNullable<NonNullable<GoogleAuthOptions>["authClient"]>;

export const ATTACHMENT_EMBEDDING_MODEL_ID = "gemini-embedding-001" as const;
export const ATTACHMENT_EMBEDDING_DIMENSIONS = 768 as const;
export const DEFAULT_DOCUMENT_SEARCH_LIMIT = 8 as const;
export const DEFAULT_SNIPPET_CHARS: number = 900;
export const DOCUMENT_SEARCH_MODES = ["hybrid", "keyword"] as const;
export type DocumentSearchMode = (typeof DOCUMENT_SEARCH_MODES)[number];
const DEFAULT_CANDIDATE_LIMIT = 40;
const RRF_K = 60;
const PAGE_TEXT_LIMIT = 12_000;
const OUTLINE_PAGE_CAP = 300;
const OUTLINE_CONTEXT_CHARS = 400;
const KEYWORD_TOKEN_RE = /[A-Za-z0-9]/;

export type RetrievalTiming = {
  embedMs: number;
  sqlMs: number;
  totalMs: number;
  skippedEmbedding: boolean;
  queryKind: RetrievalQueryKind;
};

export type DocumentSearchResult = {
  attachmentId: string;
  filename: string;
  /** Optional user note describing why this file matters. */
  description: string | null;
  pageNumber: number;
  chunkId: string;
  sourceKind: string;
  text: string;
  quote: string;
  citationId: string;
  ingestRunId: string;
  sourceSha256?: string;
  /**
   * Only set when the caller restricted the search to specific attachments:
   * true = from a tagged attachment, false = backfilled from the rest of the
   * report. Undefined for unrestricted searches.
   */
  pinned?: boolean;
};

export type ClientDocumentSearchResult = Omit<DocumentSearchResult, "sourceSha256">;

export type ReadyDocumentIndexItem = {
  attachmentId: string;
  filename: string;
  /** Optional user note used as AI document context. */
  description: string | null;
  pageCount: number | null;
  ingestRunId: string;
  /** LLM summary from the active ingest run; untrusted. */
  documentSummary: string | null;
};

export type DocumentOutlinePage = {
  pageNumber: number;
  printedPageLabel: string | null;
  pageContext: string | null;
  /** Full page transcript for server-side scoring; omit from LLM tool payloads. */
  transcript?: string;
};

export type DocumentOutline = {
  attachmentId: string;
  filename: string;
  description: string | null;
  pageCount: number | null;
  documentSummary: string | null;
  pages: DocumentOutlinePage[];
  spans: OutlineSpan[];
};

export type ReviewPageSource = {
  attachmentId: string;
  filename: string;
  pageNumber: number;
  transcript: string;
  pageContext: string | null;
  printedPageLabel: string | null;
};

export type DocumentPageRead = {
  attachmentId: string;
  filename: string;
  description: string | null;
  pageNumber: number;
  printedPageLabel: string | null;
  transcript: string;
  visualInterpretation: string;
  pageContext: string | null;
  ingestRunId: string;
};

export type CitationVerification =
  | { ok: true; result: DocumentSearchResult }
  | { ok: false; reason: "invalid_format" | "not_found" };

export type RankedInput<T> = T & { chunkId: string };

export type RankedFusionResult<T> = T & {
  rrfScore: number;
  bestRank: number;
  vectorRank?: number;
  keywordRank?: number;
};

type CandidateRow = {
  attachmentId: string;
  filename: string;
  description: string | null;
  pageNumber: number;
  chunkId: string;
  sourceKind: string;
  rawText: string;
  contextualText: string;
  ingestRunId: string;
  sourceSha256: string;
};

function hasVertexWifConfig(): boolean {
  return Boolean(getWifConfig());
}

function canUseVertexAuth(): boolean {
  if (!process.env.GOOGLE_VERTEX_PROJECT?.trim()) return false;
  if (hasVertexWifConfig()) return true;
  if (process.env.VERCEL) return false;
  return true;
}

function resolveAttachmentEmbeddingModel(): EmbeddingModel {
  if (canUseVertexAuth()) {
    const project = process.env.GOOGLE_VERTEX_PROJECT?.trim();
    const location = process.env.GOOGLE_VERTEX_LOCATION?.trim() ?? "us-central1";
    const wifConfig = getWifConfig();
    const vertex = wifConfig
      ? createVertex({
          project,
          location,
          googleAuthOptions: {
            authClient: createWifAuthClient(wifConfig) as unknown as AuthClient,
          },
        })
      : createVertex({ project, location });
    return vertex.textEmbeddingModel(ATTACHMENT_EMBEDDING_MODEL_ID);
  }

  const directKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (directKey) {
    return createGoogleGenerativeAI({ apiKey: directKey }).embedding(
      ATTACHMENT_EMBEDDING_MODEL_ID
    );
  }

  throw new Error(
    "No Gemini embedding credentials configured. Set GOOGLE_VERTEX_PROJECT or GOOGLE_GENERATIVE_AI_API_KEY."
  );
}

function vectorLiteral(values: number[]): string {
  if (values.length !== ATTACHMENT_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${ATTACHMENT_EMBEDDING_DIMENSIONS}-dimension query embedding, got ${values.length}.`
    );
  }
  return `[${values.map((v) => (Number.isFinite(v) ? String(v) : "0")).join(",")}]`;
}

function canonicalCitationId(input: {
  attachmentId: string;
  pageNumber: number;
  chunkId: string;
}): string {
  return `att:${input.attachmentId}:p:${input.pageNumber}:c:${input.chunkId}`;
}

export function parseCitationId(
  citationId: string
): { attachmentId: string; pageNumber: number; chunkId: string } | null {
  const match = /^att:([^:]+):p:(\d+):c:([^:]+)$/.exec(citationId);
  if (!match) return null;
  const pageNumber = Number(match[2]);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return null;
  return { attachmentId: match[1], pageNumber, chunkId: match[3] };
}

export function truncateSnippet(text: string, maxChars = DEFAULT_SNIPPET_CHARS): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars).trimEnd()}...`;
}

/**
 * Tokenize a retrieval query for `websearch_to_tsquery` with OR semantics.
 * Returns null when nothing searchable remains (skip the keyword arm).
 */
export function buildKeywordTsQuery(trimmed: string): string | null {
  const tokens = trimmed
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && KEYWORD_TOKEN_RE.test(token));
  if (tokens.length === 0) return null;
  return tokens.join(" or ");
}

export function reciprocalRankFusion<T extends { chunkId: string }>(
  lists: Array<{ name: "vector" | "keyword"; rows: T[] }>,
  opts: { k?: number; limit?: number } = {}
): Array<RankedFusionResult<T>> {
  const k = opts.k ?? RRF_K;
  const byId = new Map<
    string,
    {
      row: T;
      score: number;
      bestRank: number;
      vectorRank?: number;
      keywordRank?: number;
    }
  >();

  for (const list of lists) {
    list.rows.forEach((row, index) => {
      const rank = index + 1;
      const existing = byId.get(row.chunkId);
      const next =
        existing ??
        ({
          row,
          score: 0,
          bestRank: rank,
        } as {
          row: T;
          score: number;
          bestRank: number;
          vectorRank?: number;
          keywordRank?: number;
        });
      next.score += 1 / (k + rank);
      next.bestRank = Math.min(next.bestRank, rank);
      if (list.name === "vector") next.vectorRank = rank;
      if (list.name === "keyword") next.keywordRank = rank;
      byId.set(row.chunkId, next);
    });
  }

  return Array.from(byId.values())
    .sort((a, b) => b.score - a.score || a.bestRank - b.bestRank)
    .slice(0, opts.limit)
    .map(({ row, score, bestRank, vectorRank, keywordRank }) => ({
      ...row,
      rrfScore: score,
      bestRank,
      ...(vectorRank ? { vectorRank } : {}),
      ...(keywordRank ? { keywordRank } : {}),
    }));
}

function toSearchResult(
  row: CandidateRow,
  opts: { snippetChars?: number } = {}
): DocumentSearchResult {
  const quote = rewriteChunkDocumentHeader(
    truncateSnippet(
      row.contextualText || row.rawText,
      opts.snippetChars ?? DEFAULT_SNIPPET_CHARS
    ),
    row.filename
  );
  return {
    attachmentId: row.attachmentId,
    filename: row.filename,
    description: row.description ?? null,
    pageNumber: row.pageNumber,
    chunkId: row.chunkId,
    sourceKind: row.sourceKind,
    text: quote,
    quote,
    citationId: canonicalCitationId(row),
    ingestRunId: row.ingestRunId,
    sourceSha256: row.sourceSha256 || undefined,
  };
}

function stripServerOnlyFields(
  result: DocumentSearchResult
): ClientDocumentSearchResult {
  const { sourceSha256: _, ...clientResult } = result;
  void _;
  return clientResult;
}

export function toClientDocumentSearchResults(
  results: DocumentSearchResult[]
): ClientDocumentSearchResult[] {
  return results.map(stripServerOnlyFields);
}

async function embedRetrievalQuery(query: string): Promise<number[]> {
  const result = await embed({
    model: resolveAttachmentEmbeddingModel(),
    value: query,
    providerOptions: {
      google: {
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: ATTACHMENT_EMBEDDING_DIMENSIONS,
      },
      googleVertex: {
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: ATTACHMENT_EMBEDDING_DIMENSIONS,
      },
    },
  });
  return result.embedding;
}

function candidateSelect() {
  return {
    attachmentId: documentChunks.attachmentId,
    filename: reportAttachments.filename,
    description: reportAttachments.description,
    pageNumber: documentChunks.pageNumber,
    chunkId: documentChunks.id,
    sourceKind: documentChunks.sourceKind,
    rawText: documentChunks.rawText,
    contextualText: documentChunks.contextualText,
    ingestRunId: documentChunks.ingestRunId,
    sourceSha256: reportAttachments.sha256,
  };
}

/** Dedupe + drop blanks so an all-empty input behaves like "no filter". */
export function normalizeAttachmentIdFilter(
  attachmentIds: readonly string[] | undefined
): string[] {
  if (!attachmentIds) return [];
  return Array.from(
    new Set(attachmentIds.map((id) => id.trim()).filter((id) => id.length > 0))
  );
}

function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function identifiersOverlapSql(identifiers: readonly string[]) {
  return sql`${documentPages.identifiers} && ARRAY[${sql.join(
    identifiers.map((id) => sql`${id}`),
    sql`, `
  )}]::text[]`;
}

function identifiersIlikeSql(identifiers: readonly string[]) {
  return or(
    ...identifiers.map((id) => {
      const pattern = `%${escapeIlike(id)}%`;
      return sql`${documentChunks.rawText} ILIKE ${pattern} ESCAPE '\\'`;
    })
  );
}

function mergeUniqueChunks(rows: CandidateRow[]): CandidateRow[] {
  const seen = new Set<string>();
  const merged: CandidateRow[] = [];
  for (const row of rows) {
    if (seen.has(row.chunkId)) continue;
    seen.add(row.chunkId);
    merged.push(row);
  }
  return collapseToBestChunkPerPage(merged);
}

/** One hybrid vector+keyword pass, optionally narrowed to / away from attachments. */
async function fusedChunkSearch({
  reportId,
  trimmed,
  queryVector,
  limit,
  includeAttachmentIds = [],
  excludeAttachmentIds = [],
}: {
  reportId: string;
  trimmed: string;
  queryVector: string | null;
  limit: number;
  includeAttachmentIds?: string[];
  excludeAttachmentIds?: string[];
}): Promise<CandidateRow[]> {
  const candidateLimit = Math.max(limit * 5, DEFAULT_CANDIDATE_LIMIT);

  const activeScope = and(
    eq(documentChunks.reportId, reportId),
    eq(reportAttachments.reportId, reportId),
    isNull(reportAttachments.deletedAt),
    isNotNull(reportAttachments.activeIngestRunId),
    eq(documentChunks.ingestRunId, reportAttachments.activeIngestRunId),
    // Empty arrays would generate invalid SQL, so only apply a live filter.
    ...(includeAttachmentIds.length > 0
      ? [inArray(documentChunks.attachmentId, includeAttachmentIds)]
      : []),
    ...(excludeAttachmentIds.length > 0
      ? [notInArray(documentChunks.attachmentId, excludeAttachmentIds)]
      : [])
  );

  const vectorRows = queryVector
    ? await db
        .select(candidateSelect())
        .from(documentChunks)
        .innerJoin(
          reportAttachments,
          eq(documentChunks.attachmentId, reportAttachments.id)
        )
        .where(and(activeScope, isNotNull(documentChunks.embedding)))
        .orderBy(sql`${documentChunks.embedding} <=> ${queryVector}::vector`)
        .limit(candidateLimit)
    : [];

  const keywordQuery = buildKeywordTsQuery(trimmed);
  const keywordRows = keywordQuery
    ? await db
        .select(candidateSelect())
        .from(documentChunks)
        .innerJoin(
          reportAttachments,
          eq(documentChunks.attachmentId, reportAttachments.id)
        )
        .where(
          and(
            activeScope,
            sql`to_tsvector('english', ${documentChunks.contextualText}) @@ websearch_to_tsquery('english', ${keywordQuery})`
          )
        )
        .orderBy(
          desc(
            sql<number>`ts_rank_cd(to_tsvector('english', ${documentChunks.contextualText}), websearch_to_tsquery('english', ${keywordQuery}))`
          )
        )
        .limit(candidateLimit)
    : [];

  return reciprocalRankFusion(
    [
      { name: "vector", rows: vectorRows },
      { name: "keyword", rows: keywordRows },
    ],
    { k: RRF_K, limit }
  );
}

async function exactIdentifierChunkSearch({
  reportId,
  identifiers,
  limit,
  includeAttachmentIds = [],
  excludeAttachmentIds = [],
}: {
  reportId: string;
  identifiers: readonly string[];
  limit: number;
  includeAttachmentIds?: string[];
  excludeAttachmentIds?: string[];
}): Promise<CandidateRow[]> {
  if (identifiers.length === 0) return [];
  const candidateLimit = Math.max(limit * 5, DEFAULT_CANDIDATE_LIMIT);
  const activeScope = and(
    eq(documentChunks.reportId, reportId),
    eq(reportAttachments.reportId, reportId),
    isNull(reportAttachments.deletedAt),
    isNotNull(reportAttachments.activeIngestRunId),
    eq(documentChunks.ingestRunId, reportAttachments.activeIngestRunId),
    ...(includeAttachmentIds.length > 0
      ? [inArray(documentChunks.attachmentId, includeAttachmentIds)]
      : []),
    ...(excludeAttachmentIds.length > 0
      ? [notInArray(documentChunks.attachmentId, excludeAttachmentIds)]
      : [])
  );

  const overlapRows = await db
    .select(candidateSelect())
    .from(documentChunks)
    .innerJoin(
      reportAttachments,
      eq(documentChunks.attachmentId, reportAttachments.id)
    )
    .innerJoin(documentPages, eq(documentChunks.pageId, documentPages.id))
    .where(and(activeScope, identifiersOverlapSql(identifiers)))
    .orderBy(documentChunks.pageNumber, documentChunks.ordinal)
    .limit(candidateLimit);

  if (overlapRows.length > 0) {
    return collapseToBestChunkPerPage(overlapRows);
  }

  const likeCondition = identifiersIlikeSql(identifiers);
  if (!likeCondition) return [];

  const likeRows = await db
    .select(candidateSelect())
    .from(documentChunks)
    .innerJoin(
      reportAttachments,
      eq(documentChunks.attachmentId, reportAttachments.id)
    )
    .where(and(activeScope, likeCondition))
    .orderBy(documentChunks.pageNumber, documentChunks.ordinal)
    .limit(candidateLimit);

  return collapseToBestChunkPerPage(likeRows);
}

/**
 * Hybrid search over a report's ready attachments.
 *
 * `attachmentIds` (documents the engineer tagged with @) does NOT hard-filter:
 * tagged documents are searched first, and if they yield fewer than `limit`
 * hits the remainder is backfilled from the rest of the report. Hard-filtering
 * would blind the assistant whenever the answer lives in an untagged file.
 * Results carry `pinned` so the model can tell the two apart.
 *
 * Identifier queries (`requirementIds()`) run exact page-id overlap first and
 * skip the query embedding when those hits already fill `limit`. Every mode
 * collapses to one chunk per page.
 */
export async function searchReportDocuments({
  reportId,
  query,
  limit = DEFAULT_DOCUMENT_SEARCH_LIMIT,
  snippetChars = DEFAULT_SNIPPET_CHARS,
  attachmentIds,
  mode = "hybrid",
  excludePages,
}: {
  reportId: string;
  query: string;
  limit?: number;
  snippetChars?: number;
  attachmentIds?: readonly string[];
  mode?: DocumentSearchMode;
  excludePages?: readonly { attachmentId: string; pageNumber: number }[];
}): Promise<DocumentSearchResult[]> {
  const { results } = await searchReportDocumentsDetailed({
    reportId,
    query,
    limit,
    snippetChars,
    attachmentIds,
    mode,
    excludePages,
  });
  return results;
}

export async function searchReportDocumentsDetailed({
  reportId,
  query,
  limit = DEFAULT_DOCUMENT_SEARCH_LIMIT,
  snippetChars = DEFAULT_SNIPPET_CHARS,
  attachmentIds,
  mode = "hybrid",
  excludePages,
}: {
  reportId: string;
  query: string;
  limit?: number;
  snippetChars?: number;
  attachmentIds?: readonly string[];
  mode?: DocumentSearchMode;
  excludePages?: readonly { attachmentId: string; pageNumber: number }[];
}): Promise<{ results: DocumentSearchResult[]; timing: RetrievalTiming }> {
  const totalStarted = Date.now();
  let embedMs = 0;
  let sqlMs = 0;
  const trimmed = query.replace(/\s+/g, " ").trim();
  const classified = classifyRetrievalQuery(trimmed);
  const emptyTiming = (skippedEmbedding: boolean): RetrievalTiming => ({
    embedMs,
    sqlMs,
    totalMs: Date.now() - totalStarted,
    skippedEmbedding,
    queryKind: classified.kind,
  });

  if (!trimmed) {
    return { results: [], timing: emptyTiming(true) };
  }

  let queryVector: string | null = null;
  let skippedEmbedding = false;
  const needsKeyword = mode === "keyword";
  switch (mode) {
    case "keyword":
      if (!buildKeywordTsQuery(trimmed) && classified.identifiers.length === 0) {
        return { results: [], timing: emptyTiming(true) };
      }
      queryVector = null;
      skippedEmbedding = true;
      break;
    case "hybrid":
      break;
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unhandled document search mode: ${String(_exhaustive)}`);
    }
  }

  const pinnedIds = normalizeAttachmentIdFilter(attachmentIds);
  const excludeKeys = new Set(
    (excludePages ?? []).map((page) =>
      searchPageKey(page.attachmentId, page.pageNumber)
    )
  );
  const fusionLimit = Math.min(
    DEFAULT_CANDIDATE_LIMIT,
    Math.max(limit, limit + excludeKeys.size)
  );

  const take = (rows: CandidateRow[], pinned?: boolean): DocumentSearchResult[] =>
    collapseToBestChunkPerPage(rows)
      .filter(
        (row) =>
          !excludeKeys.has(searchPageKey(row.attachmentId, row.pageNumber))
      )
      .slice(0, limit)
      .map((row) => ({
        ...toSearchResult(row, { snippetChars }),
        ...(pinned === undefined ? {} : { pinned }),
      }));

  const timedSql = async <T,>(fn: () => Promise<T>): Promise<T> => {
    const started = Date.now();
    try {
      return await fn();
    } finally {
      sqlMs += Date.now() - started;
    }
  };

  const exactSearch = (scope: {
    includeAttachmentIds?: string[];
    excludeAttachmentIds?: string[];
  }) =>
    timedSql(() =>
      exactIdentifierChunkSearch({
        reportId,
        identifiers: classified.identifiers,
        limit: fusionLimit,
        ...scope,
      })
    );

  const fusedSearch = (
    queryVec: string | null,
    scope: {
      includeAttachmentIds?: string[];
      excludeAttachmentIds?: string[];
    }
  ) =>
    timedSql(() =>
      fusedChunkSearch({
        reportId,
        trimmed,
        queryVector: queryVec,
        limit: fusionLimit,
        ...scope,
      })
    );

  const embedIfNeeded = async (): Promise<string | null> => {
    if (needsKeyword) return null;
    if (queryVector) return queryVector;
    const started = Date.now();
    try {
      const queryEmbedding = await embedRetrievalQuery(trimmed);
      queryVector = vectorLiteral(queryEmbedding);
      return queryVector;
    } finally {
      embedMs += Date.now() - started;
    }
  };

  if (pinnedIds.length === 0) {
    const exactRows =
      classified.identifiers.length > 0 ? await exactSearch({}) : [];
    const exactTaken = take(exactRows);
    if (classified.identifiers.length > 0 && exactTaken.length >= limit) {
      skippedEmbedding = true;
      return {
        results: exactTaken,
        timing: emptyTiming(true),
      };
    }

    const vector = await embedIfNeeded();
    const fusedRows = await fusedSearch(vector, {});
    return {
      results: take(mergeUniqueChunks([...exactRows, ...fusedRows])),
      timing: emptyTiming(skippedEmbedding),
    };
  }

  const exactPinnedRows =
    classified.identifiers.length > 0
      ? await exactSearch({ includeAttachmentIds: pinnedIds })
      : [];
  const pinnedExact = take(exactPinnedRows, true);
  if (classified.identifiers.length > 0 && pinnedExact.length >= limit) {
    skippedEmbedding = true;
    return {
      results: pinnedExact,
      timing: emptyTiming(true),
    };
  }

  const vector = await embedIfNeeded();
  const pinnedFused = await fusedSearch(vector, {
    includeAttachmentIds: pinnedIds,
  });
  const pinnedMerged = take(
    mergeUniqueChunks([...exactPinnedRows, ...pinnedFused]),
    true
  );
  if (pinnedMerged.length >= limit) {
    return {
      results: pinnedMerged,
      timing: emptyTiming(skippedEmbedding),
    };
  }

  const exactBackfillRows =
    classified.identifiers.length > 0
      ? await exactSearch({ excludeAttachmentIds: pinnedIds })
      : [];
  if (
    classified.identifiers.length > 0 &&
    pinnedMerged.length + take(exactBackfillRows, false).length >= limit
  ) {
    skippedEmbedding = skippedEmbedding || queryVector == null;
    const remaining = limit - pinnedMerged.length;
    return {
      results: [
        ...pinnedMerged,
        ...take(exactBackfillRows, false).slice(0, remaining),
      ],
      timing: emptyTiming(skippedEmbedding),
    };
  }

  const backfillFused = await fusedSearch(vector, {
    excludeAttachmentIds: pinnedIds,
  });
  return {
    results: [
      ...pinnedMerged,
      ...take(mergeUniqueChunks([...exactBackfillRows, ...backfillFused]), false),
    ].slice(0, limit),
    timing: emptyTiming(skippedEmbedding),
  };
}

export async function listReadyDocumentsForReport(
  reportId: string
): Promise<ReadyDocumentIndexItem[]> {
  const rows = await db
    .select({
      attachmentId: reportAttachments.id,
      filename: reportAttachments.filename,
      description: reportAttachments.description,
      pageCount: reportAttachments.pageCount,
      ingestRunId: attachmentIngestRuns.id,
      documentSummary: attachmentIngestRuns.documentSummary,
    })
    .from(reportAttachments)
    .innerJoin(
      attachmentIngestRuns,
      eq(reportAttachments.activeIngestRunId, attachmentIngestRuns.id)
    )
    .where(
      and(
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt),
        isNotNull(reportAttachments.activeIngestRunId)
      )
    )
    .orderBy(reportAttachments.uploadedAt);

  return rows.map((row) => ({
    attachmentId: row.attachmentId,
    filename: row.filename,
    description: row.description ?? null,
    pageCount: row.pageCount,
    ingestRunId: row.ingestRunId,
    documentSummary: row.documentSummary ?? null,
  }));
}

export async function verifyCitation(
  reportId: string,
  citationId: string
): Promise<CitationVerification> {
  const parsed = parseCitationId(citationId);
  if (!parsed) return { ok: false, reason: "invalid_format" };

  const [row] = await db
    .select(candidateSelect())
    .from(documentChunks)
    .innerJoin(
      reportAttachments,
      eq(documentChunks.attachmentId, reportAttachments.id)
    )
    .where(
      and(
        eq(documentChunks.reportId, reportId),
        eq(documentChunks.id, parsed.chunkId),
        eq(documentChunks.attachmentId, parsed.attachmentId),
        eq(documentChunks.pageNumber, parsed.pageNumber),
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt),
        isNotNull(reportAttachments.activeIngestRunId),
        eq(documentChunks.ingestRunId, reportAttachments.activeIngestRunId)
      )
    )
    .limit(1);

  if (!row) return { ok: false, reason: "not_found" };
  return { ok: true, result: toSearchResult(row) };
}

export async function readDocumentPage({
  reportId,
  attachmentId,
  pageNumber,
}: {
  reportId: string;
  attachmentId: string;
  pageNumber: number;
}): Promise<DocumentPageRead | null> {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return null;

  const [row] = await db
    .select({
      attachmentId: documentPages.attachmentId,
      filename: reportAttachments.filename,
      description: reportAttachments.description,
      pageNumber: documentPages.pageNumber,
      printedPageLabel: documentPages.printedPageLabel,
      transcript: documentPages.transcript,
      visualInterpretation: documentPages.visualInterpretation,
      pageContext: documentPages.pageContext,
      ingestRunId: documentPages.ingestRunId,
    })
    .from(documentPages)
    .innerJoin(
      reportAttachments,
      eq(documentPages.attachmentId, reportAttachments.id)
    )
    .where(
      and(
        eq(documentPages.reportId, reportId),
        eq(documentPages.attachmentId, attachmentId),
        eq(documentPages.pageNumber, pageNumber),
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt),
        isNotNull(reportAttachments.activeIngestRunId),
        eq(documentPages.ingestRunId, reportAttachments.activeIngestRunId)
      )
    )
    .limit(1);

  if (!row) return null;
  return {
    ...row,
    description: row.description ?? null,
    transcript: truncateSnippet(row.transcript, PAGE_TEXT_LIMIT),
    visualInterpretation: truncateSnippet(row.visualInterpretation, PAGE_TEXT_LIMIT),
  };
}

export async function readDocumentOutline({
  reportId,
  attachmentId,
}: {
  reportId: string;
  attachmentId: string;
}): Promise<DocumentOutline | null> {
  const trimmedId = attachmentId.trim();
  if (!trimmedId) return null;

  const [header] = await db
    .select({
      attachmentId: reportAttachments.id,
      filename: reportAttachments.filename,
      description: reportAttachments.description,
      pageCount: reportAttachments.pageCount,
      documentSummary: attachmentIngestRuns.documentSummary,
      ingestRunId: attachmentIngestRuns.id,
    })
    .from(reportAttachments)
    .innerJoin(
      attachmentIngestRuns,
      eq(reportAttachments.activeIngestRunId, attachmentIngestRuns.id)
    )
    .where(
      and(
        eq(reportAttachments.reportId, reportId),
        eq(reportAttachments.id, trimmedId),
        isNull(reportAttachments.deletedAt),
        isNotNull(reportAttachments.activeIngestRunId)
      )
    )
    .limit(1);

  if (!header) return null;

  const pages = await db
    .select({
      pageNumber: documentPages.pageNumber,
      printedPageLabel: documentPages.printedPageLabel,
      pageContext: documentPages.pageContext,
      transcript: documentPages.transcript,
    })
    .from(documentPages)
    .where(
      and(
        eq(documentPages.reportId, reportId),
        eq(documentPages.attachmentId, trimmedId),
        eq(documentPages.ingestRunId, header.ingestRunId)
      )
    )
    .orderBy(documentPages.pageNumber)
    .limit(OUTLINE_PAGE_CAP);

  const storedSpans = await db
    .select({
      title: documentOutlineSpans.title,
      pageStart: documentOutlineSpans.pageStart,
      pageEnd: documentOutlineSpans.pageEnd,
      identifiers: documentOutlineSpans.identifiers,
    })
    .from(documentOutlineSpans)
    .where(eq(documentOutlineSpans.ingestRunId, header.ingestRunId))
    .orderBy(documentOutlineSpans.ordinal)
    .limit(OUTLINE_PAGE_CAP);

  const outline = buildOutlineFromStoredPages(pages);
  const spans: OutlineSpan[] =
    storedSpans.length > 0
      ? storedSpans.map((span) => ({
          title: span.title,
          pageStart: span.pageStart,
          pageEnd: span.pageEnd,
          identifiers: span.identifiers ?? [],
        }))
      : outline.spans;
  const transcriptByPage = new Map(
    pages.map((page) => [page.pageNumber, page.transcript ?? ""])
  );

  return {
    attachmentId: header.attachmentId,
    filename: header.filename,
    description: header.description ?? null,
    pageCount: header.pageCount,
    documentSummary: header.documentSummary ?? null,
    pages: outline.pages.map((page) => ({
      ...page,
      pageContext: page.pageContext
        ? truncateSnippet(page.pageContext, OUTLINE_CONTEXT_CHARS)
        : null,
      transcript: transcriptByPage.get(page.pageNumber) ?? "",
    })),
    spans,
  };
}

export async function listDocumentPagesForReview({
  reportId,
  attachmentIds,
}: {
  reportId: string;
  attachmentIds: readonly string[];
}): Promise<ReviewPageSource[]> {
  const ids = normalizeAttachmentIdFilter(attachmentIds);
  if (ids.length === 0) return [];

  const pages = await db
    .select({
      attachmentId: documentPages.attachmentId,
      filename: reportAttachments.filename,
      pageNumber: documentPages.pageNumber,
      transcript: documentPages.transcript,
      pageContext: documentPages.pageContext,
      printedPageLabel: documentPages.printedPageLabel,
    })
    .from(documentPages)
    .innerJoin(
      reportAttachments,
      eq(documentPages.attachmentId, reportAttachments.id)
    )
    .where(
      and(
        eq(documentPages.reportId, reportId),
        inArray(documentPages.attachmentId, ids),
        isNull(reportAttachments.deletedAt),
        isNotNull(reportAttachments.activeIngestRunId),
        eq(documentPages.ingestRunId, reportAttachments.activeIngestRunId)
      )
    )
    .orderBy(documentPages.attachmentId, documentPages.pageNumber)
    .limit(OUTLINE_PAGE_CAP);

  return pages.map((page) => ({
    attachmentId: page.attachmentId,
    filename: page.filename,
    pageNumber: page.pageNumber,
    transcript: page.transcript ?? "",
    pageContext: page.pageContext ?? null,
    printedPageLabel: page.printedPageLabel,
  }));
}
