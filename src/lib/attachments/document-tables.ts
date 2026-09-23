import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { persistDocumentTablesForRun } from "@/lib/attachments/persist-document-tables";
import {
  attachmentIngestRuns,
  documentPages,
  documentTableRows,
  documentTables,
  reportAttachments,
} from "@/db/schema";

/**
 * Reading tables recovered at ingest.
 *
 * A detected table is the one evidence shape that retrieval cannot serve — see
 * `table-extract.ts` — so this is how the worksheet gets at instrument data
 * without an LLM re-reading pages it already transcribed exactly.
 */

export type DetectedTableSummary = {
  tableId: string;
  attachmentId: string;
  filename: string;
  columns: Array<{ name: string; type: string }>;
  rowCount: number;
  pageStart: number;
  pageEnd: number;
  truncated: boolean;
};

export type LoadedDetectedTable = DetectedTableSummary & {
  /** Rows in document order, from `rowStart` (1-based, inclusive). */
  rows: Array<{ ordinal: number; pageNumber: number; values: string[] }>;
  /** 1-based index of the first returned row within the stored table. */
  rowStart: number;
  /** True when rows beyond the returned slice exist. */
  hasMore: boolean;
};

/**
 * Tables belonging to each attachment's active ingest run. Older runs stay in
 * the table for audit but must never be loaded: a re-ingest would otherwise
 * offer two copies of the same series.
 */
export async function listDetectedTablesForReport(
  reportId: string,
  options: { attachmentIds?: readonly string[] } = {}
): Promise<DetectedTableSummary[]> {
  const filters = [eq(documentTables.reportId, reportId)];
  const attachmentIds = (options.attachmentIds ?? []).filter((id) => id.trim());
  if (attachmentIds.length > 0) {
    filters.push(inArray(documentTables.attachmentId, [...attachmentIds]));
  }

  const rows = await db
    .select({
      tableId: documentTables.id,
      attachmentId: documentTables.attachmentId,
      filename: reportAttachments.filename,
      columns: documentTables.columns,
      rowCount: documentTables.rowCount,
      pageStart: documentTables.pageStart,
      pageEnd: documentTables.pageEnd,
      truncated: documentTables.truncated,
      ordinal: documentTables.ordinal,
    })
    .from(documentTables)
    .innerJoin(
      reportAttachments,
      eq(reportAttachments.id, documentTables.attachmentId)
    )
    .where(
      and(
        ...filters,
        isNull(reportAttachments.deletedAt),
        // Only the attachment's live run. A re-ingest leaves the previous run's
        // tables in place, and offering both would duplicate the same series.
        eq(reportAttachments.activeIngestRunId, documentTables.ingestRunId)
      )
    )
    .orderBy(asc(reportAttachments.filename), asc(documentTables.ordinal));

  return rows.map(({ ordinal: _ordinal, ...row }) => ({
    ...row,
    columns: row.columns ?? [],
  }));
}

/** Rows page-worth-at-a-time; the worksheet caps at `MAX_WORKSHEET_ROWS`. */
export async function loadDetectedTable(
  reportId: string,
  tableId: string,
  options: { rowStart?: number; limit?: number } = {}
): Promise<LoadedDetectedTable | null> {
  const [table] = await db
    .select({
      tableId: documentTables.id,
      attachmentId: documentTables.attachmentId,
      filename: reportAttachments.filename,
      columns: documentTables.columns,
      rowCount: documentTables.rowCount,
      pageStart: documentTables.pageStart,
      pageEnd: documentTables.pageEnd,
      truncated: documentTables.truncated,
    })
    .from(documentTables)
    .innerJoin(
      reportAttachments,
      eq(reportAttachments.id, documentTables.attachmentId)
    )
    .where(
      and(
        eq(documentTables.id, tableId),
        eq(documentTables.reportId, reportId),
        isNull(reportAttachments.deletedAt),
        eq(reportAttachments.activeIngestRunId, documentTables.ingestRunId)
      )
    )
    .limit(1);
  if (!table) return null;

  const rowStart = Math.max(1, Math.floor(options.rowStart ?? 1));
  const limit = Math.max(1, Math.floor(options.limit ?? table.rowCount));
  const firstOrdinal = rowStart - 1;
  const lastOrdinal = firstOrdinal + limit - 1;

  const rows = await db
    .select({
      ordinal: documentTableRows.ordinal,
      pageNumber: documentTableRows.pageNumber,
      values: documentTableRows.values,
    })
    .from(documentTableRows)
    .where(
      and(
        eq(documentTableRows.tableId, tableId),
        gte(documentTableRows.ordinal, firstOrdinal),
        lte(documentTableRows.ordinal, lastOrdinal)
      )
    )
    .orderBy(asc(documentTableRows.ordinal));

  return {
    ...table,
    columns: table.columns ?? [],
    rows,
    rowStart,
    hasMore: firstOrdinal + rows.length < table.rowCount,
  };
}

/**
 * Cells of one named column, aligned with the row pages so a written worksheet
 * column keeps its citations. Name match is case-insensitive; an index (`1`)
 * also resolves, because instrument headers are not always recovered.
 */
export function columnCellsFromLoadedTable(
  table: LoadedDetectedTable,
  columnRef: string
): { name: string; index: number; values: string[] } | null {
  const ref = columnRef.trim();
  if (!ref) return null;
  let index = table.columns.findIndex(
    (column) => column.name.toLowerCase() === ref.toLowerCase()
  );
  if (index < 0 && /^\d+$/.test(ref)) {
    const asIndex = Number(ref) - 1;
    if (asIndex >= 0 && asIndex < table.columns.length) index = asIndex;
  }
  if (index < 0) return null;
  return {
    name: table.columns[index]?.name ?? ref,
    index,
    values: table.rows.map((row) => row.values[index] ?? ""),
  };
}

/**
 * Attachments healed in one call. Detection is string work over transcripts
 * already in the database, but reading 20 documents' worth of page text is
 * still a second or two, and it only ever happens once per run.
 */
const MAX_SELF_HEAL_RUNS = 20;

/**
 * Parse tables for any of this report's attachments that have never been
 * through detection, then return nothing — callers read the tables normally
 * afterwards.
 *
 * Detection runs during ingest, so anything uploaded before that shipped has
 * no parsed tables. Reprocess does not fix it (`canReprocessAttachment` only
 * accepts failed attachments), and re-uploading would be absurd when
 * `document_pages.transcript` already holds the exact characters. So the first
 * request that needs a table parses it. `tablesParsedAt` is stamped either way,
 * including for documents that genuinely contain none, so this is a one-time
 * cost per ingest run rather than a cost per request.
 */
export async function ensureDocumentTablesForReport(
  reportId: string
): Promise<{ healed: number }> {
  const pending = await db
    .select({
      runId: attachmentIngestRuns.id,
      attachmentId: reportAttachments.id,
      assetId: reportAttachments.assetId,
    })
    .from(reportAttachments)
    .innerJoin(
      attachmentIngestRuns,
      eq(attachmentIngestRuns.id, reportAttachments.activeIngestRunId)
    )
    .where(
      and(
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt),
        isNull(attachmentIngestRuns.tablesParsedAt)
      )
    )
    .limit(MAX_SELF_HEAL_RUNS);

  let healed = 0;
  for (const run of pending) {
    const pages = await db
      .select({
        pageNumber: documentPages.pageNumber,
        transcript: documentPages.transcript,
      })
      .from(documentPages)
      .where(eq(documentPages.ingestRunId, run.runId))
      .orderBy(asc(documentPages.pageNumber));
    if (pages.length === 0) continue;
    try {
      await persistDocumentTablesForRun({
        runId: run.runId,
        attachmentId: run.attachmentId,
        assetId: run.assetId,
        reportId,
        pages,
      });
      healed += 1;
    } catch (error) {
      // One unparseable document must not block the others, and a failure here
      // only means a table stays unavailable — never a failed request.
      console.warn("[document-tables] On-demand parse failed", {
        runId: run.runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { healed };
}
