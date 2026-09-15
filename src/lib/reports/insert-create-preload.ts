import { and, eq, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import { reports, reportSections, type DocumentType } from "@/db/schema";
import { getDocumentType } from "@/lib/document-types";
import { sectionRowsForCreate } from "@/lib/reports/create-report-from-docx";
import { createPreloadDocumentNo } from "@/lib/reports/create-preload";

export async function deleteAuthorCreatePreloads(authorId: string): Promise<void> {
  await db
    .delete(reports)
    .where(
      and(
        eq(reports.authorId, authorId),
        sql`coalesce(${reports.metadata}->>'createPreload', 'false') = 'true'`
      )
    );
}

/**
 * Insert a hidden blank draft so Create can PATCH identity and navigate.
 * Callers must not record `report_created` until the engineer finalizes.
 */
export async function insertBlankReportPreload(args: {
  authorId: string;
  documentType: DocumentType;
}): Promise<{ id: string }> {
  await deleteAuthorCreatePreloads(args.authorId);
  const def = getDocumentType(args.documentType);
  const id = createId();
  const [report] = await db
    .insert(reports)
    .values({
      id,
      documentType: args.documentType,
      documentNo: createPreloadDocumentNo(id),
      metadata: {
        ...def.defaultMetadata,
        createPreload: true,
      },
      authorId: args.authorId,
    })
    .returning();

  if (!report) {
    throw new Error("insert(reports).returning() returned no row");
  }

  try {
    await db.insert(reportSections).values(
      sectionRowsForCreate(args.documentType, null, null).map((row) => ({
        reportId: report.id,
        section: row.section,
        content: row.content,
      }))
    );
  } catch (error) {
    await db.delete(reports).where(eq(reports.id, report.id));
    throw error;
  }

  return { id: report.id };
}
