import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, reviewFindings } from "@/db/schema";
import { generateSuggestionsForSection } from "@/lib/ai/suggest";
import { effectiveStatus } from "@/lib/ai/criteria-view";
import { normalizeCommentRecord } from "@/lib/comments/normalize";
import { mergeSectionForType } from "@/lib/document-types";
import type { CommentRecord } from "@/types/report";
import {
  persistLocatedEdit,
  persistRedraftComment,
  releaseCommentToQueue,
} from "./persist-suggestion";
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
  const sectionContent =
    args.section === "cover_page"
      ? args.ctx.report.metadata
      : (args.ctx.sections[args.section] ??
        mergeSectionForType(args.ctx.documentType, args.section, {}));
  const { suggestions } = await generateSuggestionsForSection({
    section: args.section,
    content: sectionContent,
    reportContext: {
      deviationNo: args.ctx.report.documentNo,
      date: args.ctx.report.date,
    },
    reportId: args.ctx.report.id,
    documentType: args.ctx.documentType,
    allSections: args.ctx.sections,
    gapCriteria: [
      {
        criterionKey: args.criterionKey,
        criterionLabel: evaluation.criterionLabel,
        reasoning: evaluation.reasoning,
        evaluationId: evaluation.id,
        status: effectiveStatus(evaluation),
      },
    ],
  });
  const first = suggestions[0];
  if (!first) return null;
  if (first.redraftMarkdown?.trim()) {
    return persistRedraftComment({
      ctx: args.ctx,
      section: args.section,
      contentPath: first.targetField,
      markdown: first.redraftMarkdown.trim(),
      reasoning: first.reasoning,
      evaluationId: first.evaluationId,
    });
  }
  const persisted = await persistLocatedEdit({
    ctx: args.ctx,
    section: args.section,
    contentPath: first.targetField,
    edit: {
      anchorText: first.anchorText,
      deleteText: first.deleteText,
      insertText: first.insertText,
      scope: first.scope,
      second: first.second,
    },
    reasoning: first.reasoning,
    kind: "ai_fix",
    evaluationId: first.evaluationId,
    releasedToQueue: true,
  });
  return persisted?.commentId ?? null;
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
  } else if (
    row.section &&
    typeof metadata.criterionKey === "string" &&
    typeof metadata.evaluationId === "string"
  ) {
    commentId = await generateForCriterion({
      ctx: args.ctx,
      section: row.section,
      criterionKey: metadata.criterionKey,
      evaluationId: metadata.evaluationId,
    });
  }

  if (!commentId) {
    throw new ApplyReviewFindingError(
      422,
      "Could not generate a tracked-change suggestion for this finding."
    );
  }

  const updated = await linkFindingComment(row.id, commentId, metadata);
  return {
    commentId,
    finding: updated ? dtoFromRow(updated) : dtoFromRow({ ...row, commentId }),
    comments: await commentsForReport(args.ctx.report.id),
  };
}
