import { db } from "@/db";
import { comments } from "@/db/schema";
import { getCustomerPack } from "@/lib/customers/packs";
import type { ImportedReportContent } from "@/lib/import/docx-to-sections";

/** Persist Word-comment threads copied from an uploaded investigation .docx. */
export async function persistImportedWordComments(
  reportId: string,
  importedContent: ImportedReportContent | null
): Promise<void> {
  if (!importedContent?.comments.length) return;

  const hidden = new Set(getCustomerPack().hiddenInvestigationSections);
  const importedComments = importedContent.comments.filter(
    (comment) => !hidden.has(comment.section)
  );
  if (importedComments.length === 0) return;

  const roots = importedComments.filter(
    (comment) => !comment.parentExternalCommentId
  );
  const replies = importedComments.filter(
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
