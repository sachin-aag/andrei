import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { comments } from "@/db/schema";
import { AI_AUTHOR_ID } from "@/lib/ai/constants";
import {
  serializeAiFixCommentContent,
  serializeAiRedraftCommentContent,
  type ParsedAiFixPayload,
} from "@/lib/ai/suggestion-gating";
import type { SuggestionEdit } from "@/lib/suggestions/locator";
import {
  buildSuggestionRecord,
  withSuggestionRecord,
} from "@/lib/suggestions/suggestion-record";
import { withResolutionReason } from "@/lib/suggestions/supersession";
import type { ReviewFindingDraft } from "./types";
import type { ReviewRunContext } from "./types";
import type { ReviewSeverity } from "./severity";
import { commentReleasedToQueue, withReleasedToQueue } from "./proposed-edit";
import { locatableEdit } from "./locate-proposed-edit";

function locatedPayload(args: {
  ctx: ReviewRunContext;
  section: string;
  contentPath: string;
  record: Record<string, unknown>;
  edit: SuggestionEdit;
  reasoning: string;
}): ParsedAiFixPayload {
  return withSuggestionRecord(
    {
      deleteText: args.edit.deleteText,
      insertText: args.edit.insertText,
      reasoning: args.reasoning,
      second: args.edit.second,
    },
    buildSuggestionRecord({
      sectionContent: args.record,
      section: args.section,
      targetField: args.contentPath,
      documentType: args.ctx.documentType,
      input: {
        kind: "located",
        edit: {
          anchorText: args.edit.anchorText,
          deleteText: args.edit.deleteText,
          insertText: args.edit.insertText,
          second: args.edit.second,
        },
      },
    })
  );
}

export async function persistLocatedEdit(args: {
  ctx: ReviewRunContext;
  section: string;
  contentPath: string;
  edit: SuggestionEdit;
  reasoning: string;
  kind: "ai_fix" | "ai_grammar";
  severity?: ReviewSeverity;
  evaluationId?: string | null;
  releasedToQueue?: boolean;
}): Promise<ReviewFindingDraft | null> {
  const { ctx, section, contentPath, reasoning, kind } = args;
  const located = locatableEdit(args);
  if (!located) return null;
  const sectionRow = ctx.sectionRows.find((row) => row.section === section);
  if (!sectionRow) return null;

  const payload = locatedPayload({
    ctx,
    section,
    contentPath,
    record: located.record,
    edit: located.edit,
    reasoning,
  });
  const serialized = serializeAiFixCommentContent(payload);
  const content =
    args.releasedToQueue === false
      ? serialized
      : withReleasedToQueue(serialized, true);

  const commentId = createId();
  await db.insert(comments).values({
    id: commentId,
    reportId: ctx.report.id,
    sectionId: sectionRow.id,
    section,
    authorId: AI_AUTHOR_ID,
    content,
    anchorText: located.edit.anchorText,
    contentPath,
    fromPos: null,
    toPos: null,
    status: "open",
    kind,
    evaluationId: args.evaluationId ?? null,
  });

  return {
    section,
    contentPath,
    anchorText: located.edit.anchorText,
    message: reasoning,
    severity: args.severity ?? (kind === "ai_grammar" ? "minor" : "major"),
    kind: "fixable",
    commentId,
  };
}

export async function persistRedraftComment(args: {
  ctx: ReviewRunContext;
  section: string;
  contentPath: string;
  markdown: string;
  reasoning: string;
  evaluationId?: string | null;
  releasedToQueue?: boolean;
}): Promise<string | null> {
  const sectionRow = args.ctx.sectionRows.find(
    (row) => row.section === args.section
  );
  if (!sectionRow) return null;
  const content = args.ctx.sections[args.section];
  if (!content || typeof content !== "object") return null;
  const record = content as Record<string, unknown>;
  const payload = withSuggestionRecord(
    { markdown: args.markdown, reasoning: args.reasoning },
    buildSuggestionRecord({
      sectionContent: record,
      section: args.section,
      targetField: args.contentPath,
      documentType: args.ctx.documentType,
      input: { kind: "redraft", markdown: args.markdown },
    })
  );
  const commentId = createId();
  await db.insert(comments).values({
    id: commentId,
    reportId: args.ctx.report.id,
    sectionId: sectionRow.id,
    section: args.section,
    authorId: AI_AUTHOR_ID,
    content: withReleasedToQueue(
      serializeAiRedraftCommentContent(payload),
      args.releasedToQueue !== false
    ),
    anchorText: "",
    contentPath: args.contentPath,
    fromPos: null,
    toPos: null,
    status: "open",
    kind: "ai_redraft",
    evaluationId: args.evaluationId ?? null,
  });
  return commentId;
}

export async function releaseCommentToQueue(commentId: string): Promise<void> {
  const [row] = await db
    .select({ id: comments.id, content: comments.content })
    .from(comments)
    .where(eq(comments.id, commentId));
  if (!row) return;
  await db
    .update(comments)
    .set({ content: withReleasedToQueue(row.content, true) })
    .where(eq(comments.id, commentId));
}

/**
 * A dismissed or verified finding must not leave its held suggestion behind:
 * once the finding closes, nothing hides that comment from the document queue.
 */
export async function dismissHeldReviewComment(
  commentId: string | null
): Promise<string | null> {
  if (!commentId) return null;
  const [row] = await db
    .select({ id: comments.id, content: comments.content })
    .from(comments)
    .where(
      and(
        eq(comments.id, commentId),
        eq(comments.status, "open"),
        isNull(comments.evaluationId)
      )
    );
  if (!row || commentReleasedToQueue(row.content)) return null;
  await db
    .update(comments)
    .set({
      status: "dismissed",
      content: withResolutionReason(row.content, "review_finding_closed"),
    })
    .where(eq(comments.id, row.id));
  return row.id;
}

/** Drop review-created suggestion comments when that check is re-run. */
export async function dismissReviewCreatedComments(
  commentIds: string[]
): Promise<void> {
  const ids = [...new Set(commentIds.filter(Boolean))];
  if (ids.length === 0) return;
  const rows = await db
    .select({
      id: comments.id,
      content: comments.content,
    })
    .from(comments)
    .where(
      and(
        inArray(comments.id, ids),
        eq(comments.status, "open"),
        isNull(comments.evaluationId)
      )
    );
  for (const row of rows) {
    await db
      .update(comments)
      .set({
        status: "dismissed",
        content: withResolutionReason(row.content, "review_rerun"),
      })
      .where(eq(comments.id, row.id));
  }
}
