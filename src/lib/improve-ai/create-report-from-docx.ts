import { eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, reports, reportSections, workspaceUsers } from "@/db/schema";
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
import {
  insertReportManagers,
  normalizeAssignedManagerIds,
  primaryAssignedManagerId,
  validateAssignedManagerIds,
} from "@/lib/reports/managers";
import { REPORT_SECTION_ROW_ORDER } from "@/types/sections";
import {
  auditActorFromId,
  recordAuditEvent,
  recordSectionVersion,
  WORD_ACTOR,
} from "@/lib/audit";

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
    if (inserted) {
      idByExternalId.set(comment.externalCommentId, inserted.id);
      await recordAuditEvent({
        actor: WORD_ACTOR,
        action: "comment_created",
        entityType: "comment",
        entityId: inserted.id,
        reportId,
        summary: "Word import comment",
        newValue: { section: comment.section, kind: "word_import" },
      });
    }
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
    if (inserted) {
      idByExternalId.set(comment.externalCommentId, inserted.id);
      await recordAuditEvent({
        actor: WORD_ACTOR,
        action: "comment_created",
        entityType: "comment",
        entityId: inserted.id,
        reportId,
        summary: "Word import comment reply",
        newValue: { section: comment.section, kind: "word_import", parentId },
      });
    }
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
  assignedManagerId?: string | null;
  assignedManagerIds?: string[];
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
  const assignedManagerIds = params.assignedManagerIds
    ? normalizeAssignedManagerIds(params.assignedManagerIds)
    : normalizeAssignedManagerIds([params.assignedManagerId ?? null]);
  const validation = await validateAssignedManagerIds(assignedManagerIds);
  if (!validation.ok) {
    throw new Error("One or more selected reviewers are not managers");
  }
  const assignedManagerId = primaryAssignedManagerId(assignedManagerIds);

  let createdReportId: string | null = null;
  try {
    const [report] = await db
      .insert(reports)
      .values({
        deviationNo,
        authorId: params.authorId,
        assignedManagerId,
        toolsUsed: importedContent.toolsUsed,
        ...(importedDate ? { date: importedDate } : {}),
        ...(importedOtherTools !== undefined ? { otherTools: importedOtherTools } : {}),
      })
      .returning();

    if (!report) throw new Error("Failed to create report");
    createdReportId = report.id;
    await insertReportManagers(report.id, assignedManagerIds);

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

    const [author] = await db
      .select({
        id: workspaceUsers.id,
        name: workspaceUsers.name,
        role: workspaceUsers.role,
      })
      .from(workspaceUsers)
      .where(eq(workspaceUsers.id, params.authorId))
      .limit(1);

    const actor = author
      ? { id: author.id, name: author.name, role: author.role }
      : auditActorFromId(params.authorId);

    await recordAuditEvent({
      actor,
      action: "report_created",
      entityType: "report",
      entityId: report.id,
      reportId: report.id,
      summary: `Created report ${deviationNo} from DOCX upload`,
      newValue: {
        deviationNo,
        authorId: params.authorId,
        assignedManagerId,
        assignedManagerIds,
        source: "improve_ai_docx",
      },
    });

    const sectionRows = await db
      .select()
      .from(reportSections)
      .where(eq(reportSections.reportId, report.id));

    for (const sectionRow of sectionRows) {
      await recordSectionVersion({
        actor,
        reportId: report.id,
        sectionId: sectionRow.id,
        section: sectionRow.section,
        previousContent: {},
        newContent: sectionRow.content,
        forceSnapshot: true,
      });
    }

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
