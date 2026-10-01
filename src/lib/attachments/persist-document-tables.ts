import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  attachmentIngestRuns,
  documentTableRows,
  documentTables,
} from "@/db/schema";
import { detectTables, type DetectedTable } from "@/lib/attachments/table-extract";

/**
 * Persisting detected tables for one ingest run.
 *
 * Detection runs over the page transcripts that are already in the database,
 * not over the PDF buffer. That matters: `readPdfTextLayer.usable` is
 * all-or-nothing, so one thin page — a divider, a signature page — would send
 * an otherwise perfectly extractable 80-page instrument print down the vision
 * path and the parser would never see it. Transcripts, by contrast, are
 * verbatim per page whenever the text layer carried that page (see
 * `extractMixedPagesWithDocumentAi`), so working from them recovers tables from
 * mixed documents as well as clean ones.
 */

/**
 * Rows stored per table. A cycle print is ~2,000 rows and the worksheet caps at
 * 10,000, so this is well clear of anything loadable while still bounding what
 * a pathological document can write.
 */
export const MAX_TABLE_ROWS_PERSISTED = 20_000;

/** Tables kept per document, largest first. Beyond this is page furniture. */
export const MAX_TABLES_PER_RUN = 10;

/** Guard against a runaway document writing millions of rows in one ingest. */
export const MAX_ROWS_PERSISTED_PER_RUN = 60_000;

/** Postgres parameter limits make one giant multi-row insert fail. */
const ROW_INSERT_CHUNK = 1_000;

export type PersistDocumentTablesInput = {
  runId: string;
  attachmentId: string;
  assetId: string | null;
  reportId: string;
  pages: ReadonlyArray<{ pageNumber: number; transcript: string }>;
};

export type PersistDocumentTablesResult = {
  tableCount: number;
  rowCount: number;
  /** Page spans of the tables stored, for the chunking skip below. */
  spans: Array<{ pageStart: number; pageEnd: number }>;
};

/**
 * A table has to run this many pages before its interior pages stop being
 * chunked. Below it, embedding is cheap and the retrieval loss is not worth
 * the saving.
 */
export const MIN_TABLE_SPAN_FOR_CHUNK_SKIP = 8;

/**
 * Pages to leave out of chunk + embed because they are the interior of a long
 * detected table.
 *
 * A 76-page one-minute trend print embeds to essentially one point: every page
 * is the same columns of numbers, so vector search over them is degenerate and
 * FTS on "192.4" is noise. The rows are in `document_tables` verbatim, and
 * `read_document_page` still serves the page, so nothing becomes unreachable.
 *
 * The first and last page of each span stay chunked. That is what keeps the
 * document findable at all — "the lyophilizer trend for RIG25014" has to hit
 * something — while the 74 identical pages between them cost nothing.
 */
function identifierOnEveryPageOfSpan(
  id: string,
  span: { pageStart: number; pageEnd: number },
  identifiersByPage: ReadonlyMap<number, readonly string[]>
): boolean {
  const needle = id.toLowerCase();
  for (let page = span.pageStart; page <= span.pageEnd; page += 1) {
    const ids = identifiersByPage.get(page) ?? [];
    if (!ids.some((item) => item.toLowerCase() === needle)) return false;
  }
  return true;
}

function pageHasSpanSpecificIdentifier(
  page: number,
  span: { pageStart: number; pageEnd: number },
  identifiersByPage: ReadonlyMap<number, readonly string[]>
): boolean {
  const ids = identifiersByPage.get(page) ?? [];
  return ids.some(
    (id) => !identifierOnEveryPageOfSpan(id, span, identifiersByPage)
  );
}

export function interiorTablePages(
  spans: ReadonlyArray<{ pageStart: number; pageEnd: number }>,
  identifiersByPage: ReadonlyMap<number, readonly string[]> = new Map()
): Set<number> {
  const interior = new Set<number>();
  const endpoints = new Set<number>();
  for (const span of spans) {
    endpoints.add(span.pageStart);
    endpoints.add(span.pageEnd);
    if (span.pageEnd - span.pageStart + 1 < MIN_TABLE_SPAN_FOR_CHUNK_SKIP) {
      continue;
    }
    for (let page = span.pageStart + 1; page < span.pageEnd; page += 1) {
      if (pageHasSpanSpecificIdentifier(page, span, identifiersByPage)) {
        continue;
      }
      interior.add(page);
    }
  }
  // A page that ends one table and opens another stays chunked.
  for (const page of endpoints) interior.delete(page);
  return interior;
}

/**
 * Pages the old skip rule hid that the identifier-aware rule now keeps, and
 * that still have no chunk. Non-empty means the run should be re-chunked.
 */
export function pagesToRechunkAfterIdentifierRule(input: {
  spans: ReadonlyArray<{ pageStart: number; pageEnd: number }>;
  identifiersByPage: ReadonlyMap<number, readonly string[]>;
  chunkedPages: ReadonlySet<number>;
}): number[] {
  const oldSkip = interiorTablePages(input.spans);
  const newSkip = interiorTablePages(input.spans, input.identifiersByPage);
  const pages: number[] = [];
  for (const page of oldSkip) {
    if (newSkip.has(page)) continue;
    if (input.chunkedPages.has(page)) continue;
    pages.push(page);
  }
  return pages.toSorted((a, b) => a - b);
}

/**
 * Which tables to keep, and how much of each, under the per-run budget.
 * Exported for tests: the trimming rules are the part worth asserting, and
 * they should not need a database to check.
 */
export function planTablesForPersistence(
  tables: readonly DetectedTable[]
): Array<{ table: DetectedTable; rowLimit: number; truncated: boolean }> {
  const planned: Array<{
    table: DetectedTable;
    rowLimit: number;
    truncated: boolean;
  }> = [];
  let budget = MAX_ROWS_PERSISTED_PER_RUN;

  for (const table of tables.slice(0, MAX_TABLES_PER_RUN)) {
    if (budget <= 0) break;
    const rowLimit = Math.min(table.rows.length, MAX_TABLE_ROWS_PERSISTED, budget);
    if (rowLimit <= 0) break;
    planned.push({
      table,
      rowLimit,
      truncated: rowLimit < table.rows.length,
    });
    budget -= rowLimit;
  }

  return planned;
}

export async function persistDocumentTablesForRun(
  input: PersistDocumentTablesInput
): Promise<PersistDocumentTablesResult> {
  const detected = detectTables(
    input.pages.map((page) => ({
      pageNumber: page.pageNumber,
      text: page.transcript,
    }))
  );

  // Re-running ingest replaces this run's tables rather than appending.
  await db
    .delete(documentTables)
    .where(eq(documentTables.ingestRunId, input.runId));

  // Stamped even when nothing was found, so a document that genuinely has no
  // table is not re-parsed on every later request.
  const markParsed = () =>
    db
      .update(attachmentIngestRuns)
      .set({ tablesParsedAt: new Date() })
      .where(eq(attachmentIngestRuns.id, input.runId));

  const planned = planTablesForPersistence(detected);
  if (planned.length === 0) {
    await markParsed();
    return { tableCount: 0, rowCount: 0, spans: [] };
  }

  let rowCount = 0;
  for (const [ordinal, entry] of planned.entries()) {
    const rows = entry.table.rows.slice(0, entry.rowLimit);
    const [inserted] = await db
      .insert(documentTables)
      .values({
        ingestRunId: input.runId,
        attachmentId: input.attachmentId,
        assetId: input.assetId,
        reportId: input.reportId,
        ordinal,
        columns: entry.table.columns.map((column) => ({
          name: column.name,
          type: column.type,
        })),
        signature: entry.table.signature,
        pageStart: entry.table.pageStart,
        pageEnd: entry.table.pageEnd,
        rowCount: rows.length,
        truncated: entry.truncated,
      })
      .returning({ id: documentTables.id });
    if (!inserted) continue;

    for (let start = 0; start < rows.length; start += ROW_INSERT_CHUNK) {
      const slice = rows.slice(start, start + ROW_INSERT_CHUNK);
      await db.insert(documentTableRows).values(
        slice.map((row, index) => ({
          tableId: inserted.id,
          ordinal: start + index,
          pageNumber: row.pageNumber,
          values: row.values,
        }))
      );
    }
    rowCount += rows.length;
  }

  await markParsed();

  return {
    tableCount: planned.length,
    rowCount,
    spans: planned.map((entry) => ({
      pageStart: entry.table.pageStart,
      pageEnd: entry.table.pageEnd,
    })),
  };
}
