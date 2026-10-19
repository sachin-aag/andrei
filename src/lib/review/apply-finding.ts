import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, reviewFindings } from "@/db/schema";
import { effectiveStatus } from "@/lib/ai/criteria-view";
import { normalizeCommentRecord } from "@/lib/comments/normalize";
import type { CommentRecord } from "@/types/report";
import { persistLocatedEdit, releaseCommentToQueue } from "./persist-suggestion";
import { criterionSuggestionComments } from "./prepare-suggestions";
import { proposedEditFromMetadata } from "./proposed-edit";
import type { ReviewFindingDto } from "./ui";
import type { ReviewRunContext } from "./types";
import { coerceReviewSeverity } from "./severity";

export class ApplyReviewFindingError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApplyReviewFindingError";
    this.status = status;
  }
}

function dtoFromRow(row: typeof reviewFindings.$inferSelect): ReviewFindingDto {
  return {
    id: row.id,
    checkId: row.checkId,
    section: row.section,
    contentPath: row.contentPath,
    anchorText: row.anchorText,
    message: row.message,
    severity: coerceReviewSeverity(row.severity),
    kind: row.kind,
    commentId: row.commentId,
    status: row.status,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}

async function commentsForReport(reportId: string): Promise<CommentRecord[]> {
  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.reportId, reportId));
  return rows.map((row) =>
    normalizeCommentRecord(row as unknown as Record<string, unknown>)
  );
}

async function linkFindingComment(
  findingId: string,
  commentId: string,
  metadata: Record<string, unknown>
): Promise<typeof reviewFindings.$inferSelect | null> {
  const [updated] = await db
    .update(reviewFindings)
    .set({
      commentId,
      kind: "fixable",
      metadata,
    })
    .where(eq(reviewFindings.id, findingId))
    .returning();
  return updated ?? null;
}

async function generateForCriterion(args: {
  ctx: ReviewRunContext;
  section: string;
  criterionKey: string;
  evaluationId: string;
}): Promise<string | null> {
  const evaluation = args.ctx.evaluations.find(
    (row) => row.id === args.evaluationId
  );
  if (!evaluation) return null;
  const comments = await criterionSuggestionComments({
    ctx: args.ctx,
    section: args.section,
    gaps: [
      {
        criterionKey: args.criterionKey,
        criterionLabel: evaluation.criterionLabel,
        reasoning: evaluation.reasoning,
        evaluationId: evaluation.id,
        status: effectiveStatus(evaluation),
      },
    ],
    held: false,
  });
  return comments.get(evaluation.id) ?? null;
}

export async function applyReviewFindingAsTrackedChange(args: {
  ctx: ReviewRunContext;
  findingId: string;
}): Promise<{
  commentId: string;
  finding: ReviewFindingDto | null;
  comments: CommentRecord[];
}> {
  const livePrefix = "live:";
  const isLive = args.findingId.startsWith(livePrefix);

  if (isLive) {
    const evaluationId = args.findingId.slice(livePrefix.length);
    const evaluation = args.ctx.evaluations.find((row) => row.id === evaluationId);
    if (!evaluation) {
      throw new ApplyReviewFindingError(404, "Not found");
    }
    const existing = args.ctx.comments.find(
      (row) =>
        row.evaluationId === evaluationId &&
        row.status === "open" &&
        !row.parentId
    );
    let commentId = existing?.id ?? null;
    if (commentId) {
      await releaseCommentToQueue(commentId);
    } else {
      commentId = await generateForCriterion({
        ctx: args.ctx,
        section: evaluation.section,
        criterionKey: evaluation.criterionKey,
        evaluationId: evaluation.id,
      });
    }
    if (!commentId) {
      throw new ApplyReviewFindingError(
        422,
        "Could not generate a tracked-change suggestion for this finding."
      );
    }
    return {
      commentId,
      finding: null,
      comments: await commentsForReport(args.ctx.report.id),
    };
  }

  const [row] = await db
    .select()
    .from(reviewFindings)
    .where(
      and(
        eq(reviewFindings.id, args.findingId),
        eq(reviewFindings.reportId, args.ctx.report.id)
      )
    );
  if (!row || row.status !== "open") {
    throw new ApplyReviewFindingError(404, "Not found");
  }
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const proposed = proposedEditFromMetadata(metadata);

  let commentId = row.commentId;
  if (commentId) {
    await releaseCommentToQueue(commentId);
  } else if (proposed && row.section && row.contentPath) {
    const persisted = await persistLocatedEdit({
      ctx: args.ctx,
      section: row.section,
      contentPath: row.contentPath,
      edit: {
        anchorText: proposed.anchorText,
        deleteText: proposed.deleteText,
        insertText: proposed.insertText,
      },
      reasoning: row.message,
      kind: proposed.kind,
      severity: coerceReviewSeverity(row.severity),
      releasedToQueue: true,
    });
    commentId = persisted?.commentId ?? null;
  }

  if (!commentId) {
    throw new ApplyReviewFindingError(
      422,
      "No suggestion was automatically available. Human review is needed."
    );
  }

  const updated = await linkFindingComment(row.id, commentId, metadata);
  return {
    commentId,
    finding: updated ? dtoFromRow(updated) : dtoFromRow({ ...row, commentId }),
    comments: await commentsForReport(args.ctx.report.id),
  };
}
