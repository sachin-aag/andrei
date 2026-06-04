import { eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, reports, reportSections } from "@/db/schema";
import type { ImportedReportContent } from "@/lib/import/docx-to-sections";
import { readDocxUpload } from "@/lib/import/docx-upload";
import { docxBufferToImportedReportContent } from "@/lib/import/docx-to-sections";
import { persistReportSourceDocx } from "@/lib/reports/persist-source-docx";
import {
  DUPLICATE_DEVIATION_NO_ERROR,
  isDeviationNoTaken,
  isPostgresUniqueViolation,
  normalizeDeviationNo,
} from "@/lib/reports/deviation-no";
import { seedBlankReportSections } from "@/lib/reports/seed-blank-report-sections";
import { REPORT_SECTION_ROW_ORDER } from "@/types/sections";

async function persistImportedComments(
  reportId: string,
  importedContent: ImportedReportContent | null
) {
  if (!importedContent?.comments.length) return;

  const roots = importedContent.comments.filter(
    (comment) => !comment.parentExternalCommentId
  );
  const replies = importedContent.comments.filter(
    (comment) => comment.parentExternalCommentId
  );
  const idByExternalId = new Map<string, string>();

  for (const comment of roots) {
    const [inserted] = await db
      .insert(comments)
      .values({
        reportId,
        section: comment.section,
        authorId: "word",
        content: comment.content,
        anchorText: comment.anchorText,
        contentPath: comment.contentPath,
        fromPos: comment.fromPos,
        toPos: comment.toPos,
        kind: "word_import",
        source: "word",
        externalAuthorName: comment.externalAuthorName,
        externalAuthorInitials: comment.externalAuthorInitials,
        externalCommentId: comment.externalCommentId,
        externalCreatedAt: comment.externalCreatedAt,
        locked: true,
      })
      .returning();
    if (inserted) idByExternalId.set(comment.externalCommentId, inserted.id);
  }

  for (const comment of replies) {
    const parentId = comment.parentExternalCommentId
      ? idByExternalId.get(comment.parentExternalCommentId)
      : undefined;
    const [inserted] = await db
      .insert(comments)
      .values({
        reportId,
        parentId: parentId ?? null,
        section: comment.section,
        authorId: "word",
        content: comment.content,
        anchorText: parentId ? "" : comment.anchorText,
        contentPath: parentId ? null : comment.contentPath,
        fromPos: parentId ? null : comment.fromPos,
        toPos: parentId ? null : comment.toPos,
        kind: "word_import",
        source: "word",
        externalAuthorName: comment.externalAuthorName,
        externalAuthorInitials: comment.externalAuthorInitials,
        externalCommentId: comment.externalCommentId,
        externalCreatedAt: comment.externalCreatedAt,
        locked: true,
      })
      .returning();
    if (inserted) idByExternalId.set(comment.externalCommentId, inserted.id);
  }
}

export type CreateReportFromDocxResult = {
  reportId: string;
  deviationNo: string;
  filename: string;
};

export async function createReportFromDocxUpload(params: {
  file: File;
  authorId: string;
  deviationNo?: string;
}): Promise<CreateReportFromDocxResult> {
  const buf = await readDocxUpload(params.file);
  const importedContent = await docxBufferToImportedReportContent(buf);
  const filename = params.file.name;

  const deviationNo = normalizeDeviationNo(
    params.deviationNo?.trim() ||
      importedContent.header.deviationNo?.trim() ||
      filename.replace(/\.docx$/i, "")
  );

  if (!deviationNo) {
    throw new Error("Deviation number is required");
  }

  if (await isDeviationNoTaken(deviationNo, params.authorId)) {
    throw new Error(DUPLICATE_DEVIATION_NO_ERROR);
  }

  const importedDate = importedContent.header.date;
  const importedOtherTools = importedContent.header.otherTools?.trim();

  let createdReportId: string | null = null;
  try {
    const [report] = await db
      .insert(reports)
      .values({
        deviationNo,
        authorId: params.authorId,
        toolsUsed: importedContent.toolsUsed,
        ...(importedDate ? { date: importedDate } : {}),
        ...(importedOtherTools !== undefined ? { otherTools: importedOtherTools } : {}),
      })
      .returning();

    if (!report) throw new Error("Failed to create report");
    createdReportId = report.id;

    const blankSections = seedBlankReportSections();
    await db.insert(reportSections).values(
      REPORT_SECTION_ROW_ORDER.map((section) => ({
        reportId: report.id,
        section,
        content: importedContent.sections[section] as unknown as Record<string, unknown>,
      }))
    );

    await persistImportedComments(report.id, importedContent);
    await persistReportSourceDocx({
      reportId: report.id,
      buffer: buf,
      filename,
      uploadedById: params.authorId,
    });

    return { reportId: report.id, deviationNo, filename };
  } catch (e) {
    if (createdReportId) {
      await db.delete(reports).where(eq(reports.id, createdReportId));
    }
    if (isPostgresUniqueViolation(e)) {
      throw new Error(DUPLICATE_DEVIATION_NO_ERROR);
    }
    throw e;
  }
}
