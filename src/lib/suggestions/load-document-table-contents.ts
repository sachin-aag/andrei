import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, reportSections, type DocumentType } from "@/db/schema";
import { mergeSection } from "@/lib/sections-merge";
import {
  documentContentsFromReportState,
  type TableNumberComment,
} from "@/lib/suggestions/document-table-number";
import type { DocumentTableContent } from "@/lib/suggestions/table-operation";

/** Server-side snapshot of filled-table order, including open `edit_table` cards. */
export async function loadDocumentContentsForTableNumber(args: {
  reportId: string;
  documentType: DocumentType;
  exceptCommentId?: string;
}): Promise<DocumentTableContent[]> {
  const [sectionRows, commentRows] = await Promise.all([
    db
      .select({
        section: reportSections.section,
        content: reportSections.content,
      })
      .from(reportSections)
      .where(eq(reportSections.reportId, args.reportId)),
    db
      .select({
        id: comments.id,
        section: comments.section,
        content: comments.content,
        contentPath: comments.contentPath,
        status: comments.status,
        kind: comments.kind,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .where(and(eq(comments.reportId, args.reportId))),
  ]);

  const sections: Partial<Record<string, unknown>> = {};
  for (const row of sectionRows) {
    sections[row.section] = mergeSection(row.section, row.content);
  }

  const overlayComments: TableNumberComment[] = commentRows.map((row) => ({
    id: row.id,
    section: row.section,
    content: row.content,
    contentPath: row.contentPath,
    status: row.status,
    kind: row.kind,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? ""),
  }));

  return documentContentsFromReportState({
    documentType: args.documentType,
    sections,
    comments: overlayComments,
    exceptCommentId: args.exceptCommentId,
  });
}
