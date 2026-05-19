import { parseAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import { getUser } from "@/lib/auth/mock-users";
import type { CommentRecord, EvaluationRecord } from "@/types/report";

const MAX_TITLE_LEN = 72;
const MAX_PREVIEW_LEN = 160;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncateAtWord(text: string, max: number): string {
  const t = collapseWhitespace(text);
  if (t.length <= max) return t;
  const slice = t.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 28 ? slice.slice(0, lastSpace) : slice;
  return `${cut}…`;
}

function firstSentence(text: string, max = MAX_TITLE_LEN): string {
  const t = collapseWhitespace(text);
  const match = t.match(/^(.+?[.!?])(?:\s|$)/);
  if (match && match[1].length <= max) return match[1];
  return truncateAtWord(t, max);
}

function summarizeInsertForTitle(insertText: string): string {
  let t = collapseWhitespace(insertText);
  t = t.replace(
    /^This (?:contradicts|suggests|indicates|highlights|notes) (?:the expected standard that )?/i,
    ""
  );
  t = t.replace(/^The actual /i, "");
  if (t.length > 0) {
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  return firstSentence(t);
}

/** Short label for sidebar / comment list cards. */
export function getAiFixCommentTitle(
  comment: CommentRecord,
  evaluations: EvaluationRecord[] = []
): string {
  if (comment.evaluationId) {
    const linked = evaluations.find((e) => e.id === comment.evaluationId);
    if (linked?.criterionLabel) {
      return truncateAtWord(linked.criterionLabel, MAX_TITLE_LEN);
    }
  }

  const payload = parseAiFixCommentContent(comment.content);
  if (payload.reasoning.trim()) {
    return truncateAtWord(payload.reasoning, MAX_TITLE_LEN);
  }
  if (payload.insertText.trim()) {
    return summarizeInsertForTitle(payload.insertText);
  }
  return "Suggested fix";
}

/** One- or two-line preview (not raw JSON) for ai_fix comments. */
export function getAiFixCommentPreview(comment: CommentRecord): string {
  const payload = parseAiFixCommentContent(comment.content);
  const insert = collapseWhitespace(payload.insertText);
  const del = collapseWhitespace(payload.deleteText);

  if (del && insert) {
    return `${truncateAtWord(del, 56)} → ${truncateAtWord(insert, MAX_PREVIEW_LEN - 60)}`;
  }
  if (insert) return truncateAtWord(insert, MAX_PREVIEW_LEN);
  if (payload.reasoning.trim()) {
    return truncateAtWord(payload.reasoning, MAX_PREVIEW_LEN);
  }
  return "";
}

export function isAiFixComment(comment: CommentRecord): boolean {
  return comment.kind === "ai_fix";
}

/** Primary heading on a comment card (author name for humans, fix summary for AI). */
export function getCommentCardTitle(
  comment: CommentRecord,
  evaluations: EvaluationRecord[] = []
): string {
  if (isAiFixComment(comment)) {
    return getAiFixCommentTitle(comment, evaluations);
  }
  return getUser(comment.authorId)?.name ?? "Unknown";
}

/** Body preview under the title. */
export function getCommentCardPreview(comment: CommentRecord): string {
  if (isAiFixComment(comment)) {
    return getAiFixCommentPreview(comment);
  }
  return comment.content;
}
