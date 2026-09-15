import type { DocumentType } from "@/db/schema";
import { parseAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import { getWorkspaceSections } from "@/lib/document-types";
import { getRichFieldValue, setRichFieldValue } from "@/lib/suggestions/rich-field-value";
import {
  applyTableOperation,
  type DocumentTableContent,
} from "@/lib/suggestions/table-operation";
import type { CommentRecord } from "@/types/report";

export type TableNumberComment = Pick<
  CommentRecord,
  "id" | "section" | "content" | "contentPath" | "status" | "kind" | "createdAt"
>;

function commentTime(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Workspace sections in document order that have content in `sections`. */
export function orderedSectionContents(args: {
  documentType: DocumentType;
  sections: Readonly<Partial<Record<string, unknown>>>;
}): DocumentTableContent[] {
  return getWorkspaceSections(args.documentType).flatMap((section) => {
    const content = args.sections[section.key];
    if (content === undefined) return [];
    return [{ section: section.key, content }];
  });
}

/**
 * Apply other open `edit_table` suggestions onto cloned section maps so a
 * pending Media Fill fill occupies an ordinal before Monitoring is numbered.
 * Failures are skipped; only `tableHasData` on the clone matters.
 */
export function overlayPendingTableOperations(args: {
  contents: readonly DocumentTableContent[];
  comments: readonly TableNumberComment[];
  exceptCommentId?: string;
}): DocumentTableContent[] {
  const next = args.contents.map((row) => ({
    section: row.section,
    content: structuredClone(row.content),
  }));
  const bySection = new Map(next.map((row) => [row.section, row]));
  const sectionOrder = new Map(
    next.map((row, index) => [row.section, index])
  );

  const pending = args.comments
    .filter(
      (comment) =>
        comment.id !== args.exceptCommentId &&
        comment.status === "open" &&
        comment.kind === "ai_fix" &&
        Boolean(comment.section)
    )
    .flatMap((comment) => {
      const operation = parseAiFixCommentContent(comment.content).tableOperation;
      if (!operation || !comment.section) return [];
      return [{ comment, operation }];
    })
    .sort((a, b) => {
      const aOrder =
        sectionOrder.get(a.comment.section ?? "") ?? Number.MAX_SAFE_INTEGER;
      const bOrder =
        sectionOrder.get(b.comment.section ?? "") ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return commentTime(a.comment.createdAt) - commentTime(b.comment.createdAt);
    });

  for (const { comment, operation } of pending) {
    const section = comment.section;
    if (!section) continue;
    const row = bySection.get(section);
    if (!row || !row.content || typeof row.content !== "object") continue;
    const field = comment.contentPath ?? "table";
    if (!isRichTargetField(section, field)) continue;
    const sectionContent = row.content as Record<string, unknown>;
    const applied = applyTableOperation(
      getRichFieldValue(sectionContent, field),
      operation,
      { section, targetField: field }
    );
    if (!applied.ok) continue;
    row.content = setRichFieldValue(sectionContent, field, applied.doc);
  }

  return next;
}

/** Ordered workspace contents plus pending table-ops, excluding `exceptCommentId`. */
export function documentContentsFromReportState(args: {
  documentType: DocumentType;
  sections: Readonly<Partial<Record<string, unknown>>>;
  comments: readonly TableNumberComment[];
  exceptCommentId?: string;
}): DocumentTableContent[] {
  return overlayPendingTableOperations({
    contents: orderedSectionContents({
      documentType: args.documentType,
      sections: args.sections,
    }),
    comments: args.comments,
    exceptCommentId: args.exceptCommentId,
  });
}
