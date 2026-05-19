import type { CommentRecord } from "@/types/report";

/** Normalize API/DB comment rows for client state. */
export function normalizeCommentRecord(
  row: Record<string, unknown>
): CommentRecord {
  return {
    id: String(row.id),
    reportId: String(row.reportId),
    parentId: row.parentId != null ? String(row.parentId) : null,
    sectionId: row.sectionId != null ? String(row.sectionId) : null,
    section: (row.section as CommentRecord["section"]) ?? null,
    authorId: String(row.authorId),
    content: String(row.content ?? ""),
    anchorText: String(row.anchorText ?? ""),
    contentPath: row.contentPath != null ? String(row.contentPath) : null,
    fromPos: typeof row.fromPos === "number" ? row.fromPos : null,
    toPos: typeof row.toPos === "number" ? row.toPos : null,
    status: row.status as CommentRecord["status"],
    kind: (row.kind as CommentRecord["kind"]) ?? "human",
    evaluationId: row.evaluationId != null ? String(row.evaluationId) : null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? ""),
  };
}
