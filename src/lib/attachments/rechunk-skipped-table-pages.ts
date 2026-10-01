import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attachmentIngestRuns,
  documentChunks,
  documentPages,
  documentTables,
  reportAttachments,
} from "@/db/schema";
import {
  MIN_TABLE_SPAN_FOR_CHUNK_SKIP,
  pagesToRechunkAfterIdentifierRule,
} from "@/lib/attachments/persist-document-tables";
import { rechunkStoredPagesForRun } from "@/lib/attachments/run-document-ingest";

export type IdentifierRechunkCandidate = {
  runId: string;
  attachmentId: string;
  assetId: string | null;
  reportId: string;
  filename: string;
  embeddingModelId: string;
  pages: number[];
};

export async function listIdentifierRechunkCandidates(): Promise<
  IdentifierRechunkCandidate[]
> {
  const tableRows = await db
    .select({
      runId: documentTables.ingestRunId,
      pageStart: documentTables.pageStart,
      pageEnd: documentTables.pageEnd,
      attachmentId: reportAttachments.id,
      assetId: reportAttachments.assetId,
      reportId: reportAttachments.reportId,
      filename: reportAttachments.filename,
      embeddingModelId: attachmentIngestRuns.embeddingModelId,
    })
    .from(documentTables)
    .innerJoin(
      reportAttachments,
      and(
        eq(reportAttachments.activeIngestRunId, documentTables.ingestRunId),
        isNull(reportAttachments.deletedAt)
      )
    )
    .innerJoin(
      attachmentIngestRuns,
      eq(attachmentIngestRuns.id, documentTables.ingestRunId)
    )
    .where(
      sql`${documentTables.pageEnd} - ${documentTables.pageStart} + 1 >= ${MIN_TABLE_SPAN_FOR_CHUNK_SKIP}`
    );

  const byRun = new Map<
    string,
    {
      meta: Omit<IdentifierRechunkCandidate, "pages">;
      spans: Array<{ pageStart: number; pageEnd: number }>;
    }
  >();
  for (const row of tableRows) {
    const existing = byRun.get(row.runId);
    if (existing) {
      existing.spans.push({ pageStart: row.pageStart, pageEnd: row.pageEnd });
      continue;
    }
    byRun.set(row.runId, {
      meta: {
        runId: row.runId,
        attachmentId: row.attachmentId,
        assetId: row.assetId,
        reportId: row.reportId,
        filename: row.filename,
        embeddingModelId: row.embeddingModelId,
      },
      spans: [{ pageStart: row.pageStart, pageEnd: row.pageEnd }],
    });
  }

  const candidates: IdentifierRechunkCandidate[] = [];
  for (const [runId, { meta, spans }] of byRun) {
    const [pageRows, chunkRows] = await Promise.all([
      db
        .select({
          pageNumber: documentPages.pageNumber,
          identifiers: documentPages.identifiers,
        })
        .from(documentPages)
        .where(eq(documentPages.ingestRunId, runId)),
      db
        .select({ pageNumber: documentChunks.pageNumber })
        .from(documentChunks)
        .where(eq(documentChunks.ingestRunId, runId)),
    ]);
    const identifiersByPage = new Map<number, readonly string[]>();
    for (const page of pageRows) {
      identifiersByPage.set(page.pageNumber, page.identifiers ?? []);
    }
    const pages = pagesToRechunkAfterIdentifierRule({
      spans,
      identifiersByPage,
      chunkedPages: new Set(chunkRows.map((row) => row.pageNumber)),
    });
    if (pages.length === 0) continue;
    candidates.push({ ...meta, pages });
  }
  return candidates;
}

export async function rechunkIdentifierSkippedTablePages(input: {
  dryRun: boolean;
}): Promise<{
  candidates: IdentifierRechunkCandidate[];
  rechunked: number;
}> {
  const candidates = await listIdentifierRechunkCandidates();
  if (input.dryRun || candidates.length === 0) {
    return { candidates, rechunked: 0 };
  }

  let rechunked = 0;
  for (const candidate of candidates) {
    await rechunkStoredPagesForRun(candidate);
    rechunked += 1;
  }
  return { candidates, rechunked };
}
