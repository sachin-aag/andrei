/**
 * Re-runs table detection over transcripts that are already in the database.
 *
 * Table parsing happens during ingest, so attachments uploaded before that
 * code shipped have no rows in `document_tables` — and the Reprocess button
 * will not help, because `canReprocessAttachment` only accepts failed or
 * incompletely-indexed attachments, not healthy ones.
 *
 * Re-uploading is the wrong fix: detection reads `document_pages.transcript`,
 * which is already stored verbatim, so nothing needs extracting again. This
 * walks those transcripts through the production persistence path — no Vertex
 * calls, no page budget, no re-upload.
 *
 *   pnpm backfill-document-tables <reportId> [...more]
 *   pnpm backfill-document-tables --all        # every report with attachments
 *   pnpm backfill-document-tables <reportId> --dry-run
 */
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { documentPages, reportAttachments } from "@/db/schema";
import { detectTables } from "@/lib/attachments/table-extract";
import {
  persistDocumentTablesForRun,
  planTablesForPersistence,
} from "@/lib/attachments/persist-document-tables";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const all = args.includes("--all");
const reportIds = args.filter((arg) => !arg.startsWith("--"));

if (!all && reportIds.length === 0) {
  console.error(
    "usage: pnpm backfill-document-tables <reportId> [...] [--dry-run]\n" +
      "       pnpm backfill-document-tables --all [--dry-run]"
  );
  process.exit(2);
}

async function attachmentsFor(reportId: string | null) {
  const filters = [
    isNull(reportAttachments.deletedAt),
    isNotNull(reportAttachments.activeIngestRunId),
  ];
  if (reportId) filters.push(eq(reportAttachments.reportId, reportId));
  return db
    .select({
      id: reportAttachments.id,
      reportId: reportAttachments.reportId,
      assetId: reportAttachments.assetId,
      filename: reportAttachments.filename,
      runId: reportAttachments.activeIngestRunId,
    })
    .from(reportAttachments)
    .where(and(...filters))
    .orderBy(asc(reportAttachments.filename));
}

async function main() {
  const targets = all
    ? await attachmentsFor(null)
    : (await Promise.all(reportIds.map((id) => attachmentsFor(id)))).flat();

  if (targets.length === 0) {
    console.log("No ingested attachments found for that report.");
    process.exit(1);
  }

  let withTables = 0;
  let totalRows = 0;

  for (const attachment of targets) {
    const runId = attachment.runId;
    if (!runId) continue;
    const pages = await db
      .select({
        pageNumber: documentPages.pageNumber,
        transcript: documentPages.transcript,
      })
      .from(documentPages)
      .where(eq(documentPages.ingestRunId, runId))
      .orderBy(asc(documentPages.pageNumber));

    if (pages.length === 0) {
      console.log(`${attachment.filename}: no stored pages — skipped`);
      continue;
    }

    if (dryRun) {
      const detected = detectTables(
        pages.map((page) => ({
          pageNumber: page.pageNumber,
          text: page.transcript,
        }))
      );
      const planned = planTablesForPersistence(detected);
      if (planned.length === 0) {
        console.log(`${attachment.filename}: ${pages.length} pages, no table`);
        continue;
      }
      withTables += 1;
      for (const [index, entry] of planned.entries()) {
        totalRows += entry.rowLimit;
        console.log(
          `${attachment.filename}: table ${index + 1} ` +
            `rows=${entry.rowLimit}${entry.truncated ? " (truncated)" : ""} ` +
            `cols=${entry.table.columns.length} ` +
            `pages=${entry.table.pageStart}-${entry.table.pageEnd} ` +
            `sig=${entry.table.signature}`
        );
        console.log(
          `    ${entry.table.columns.map((c) => `${c.name}:${c.type}`).join("  ")}`
        );
      }
      continue;
    }

    const result = await persistDocumentTablesForRun({
      runId,
      attachmentId: attachment.id,
      assetId: attachment.assetId,
      reportId: attachment.reportId,
      pages,
    });
    if (result.tableCount > 0) withTables += 1;
    totalRows += result.rowCount;
    console.log(
      `${attachment.filename}: ${pages.length} pages → ` +
        `${result.tableCount} table(s), ${result.rowCount} row(s)`
    );
  }

  console.log(
    `\n${dryRun ? "Would store" : "Stored"} ${totalRows} row(s) across ` +
      `${withTables} of ${targets.length} attachment(s).`
  );
  process.exit(0);
}

void main();
