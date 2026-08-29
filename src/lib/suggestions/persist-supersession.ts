import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, type SectionType } from "@/db/schema";
import {
  AI_ACTOR,
  recordAuditEvent,
  type AuditActorSnapshot,
} from "@/lib/audit";
import { isAiSuggestionKind } from "@/lib/ai/suggestion-gating";
import {
  findSupersededSuggestions,
  resolutionReasonSupersededBy,
  withResolutionReason,
  type SupersessionPair,
} from "@/lib/suggestions/supersession";
import type { CommentRecord } from "@/types/report";

function toCommentRecord(
  row: typeof comments.$inferSelect
): CommentRecord {
  return {
    id: row.id,
    reportId: row.reportId,
    parentId: row.parentId,
    sectionId: row.sectionId,
    section: row.section as CommentRecord["section"],
    authorId: row.authorId,
    content: row.content,
    anchorText: row.anchorText,
    contentPath: row.contentPath,
    fromPos: row.fromPos,
    toPos: row.toPos,
    status: row.status,
    kind: row.kind,
    source: row.source,
    externalAuthorName: row.externalAuthorName,
    externalAuthorInitials: row.externalAuthorInitials,
    externalCommentId: row.externalCommentId,
    externalCreatedAt: row.externalCreatedAt
      ? row.externalCreatedAt.toISOString()
      : null,
    locked: row.locked,
    evaluationId: row.evaluationId,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}

/**
 * After inserting a new open AI suggestion, dismiss older open suggestions
 * whose ranges it fully covers. Uses `dismissed` + payload reason — never
 * `resolved` (that would claim an edit was applied).
 */
export async function dismissSuggestionsSupersededBy(args: {
  reportId: string;
  section: SectionType;
  sectionContent: Record<string, unknown>;
  newCommentId: string;
  actor?: AuditActorSnapshot;
}): Promise<SupersessionPair[]> {
  const rows = await db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.reportId, args.reportId),
        eq(comments.section, args.section),
        eq(comments.status, "open")
      )
    );
  const open = rows
    .map(toCommentRecord)
    .filter((row) => isAiSuggestionKind(row.kind) && !row.parentId);
  const pairs = findSupersededSuggestions({
    section: args.section,
    comments: open,
    sectionContent: args.sectionContent,
  }).filter((pair) => pair.supersededBy === args.newCommentId);
  if (pairs.length === 0) return [];

  const actor = args.actor ?? AI_ACTOR;
  const byId = new Map(open.map((row) => [row.id, row]));
  for (const pair of pairs) {
    const superseded = byId.get(pair.supersededId);
    if (!superseded) continue;
    const nextContent = withResolutionReason(
      superseded.content,
      resolutionReasonSupersededBy(pair.supersededBy)
    );
    await db
      .update(comments)
      .set({
        status: "dismissed",
        content: nextContent,
      })
      .where(
        and(
          eq(comments.reportId, args.reportId),
          eq(comments.id, pair.supersededId)
        )
      );
    await recordAuditEvent({
      actor,
      action: "comment_status_changed",
      entityType: "comment",
      entityId: pair.supersededId,
      reportId: args.reportId,
      summary: `Suggestion superseded by ${pair.supersededBy}`,
      oldValue: { status: "open" },
      newValue: {
        status: "dismissed",
        resolutionReason: resolutionReasonSupersededBy(pair.supersededBy),
      },
    });
  }
  return pairs;
}
