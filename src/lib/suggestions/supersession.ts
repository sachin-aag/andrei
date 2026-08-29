import type { SectionType } from "@/db/schema";
import type { CommentRecord } from "@/types/report";
import { parseAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import {
  spanForSuggestionComment,
  suggestionApplySpanContains,
  type SuggestionApplySpan,
} from "@/lib/suggestions/suggestion-overlap";

export const SUPERSEDED_BY_PREFIX = "superseded_by:";

export type SupersessionPair = {
  supersededId: string;
  supersededBy: string;
};

function isWholeFieldIntent(comment: CommentRecord): boolean {
  return comment.kind === "ai_redraft";
}

function coveringSpan(args: {
  section: SectionType;
  comment: CommentRecord;
  sectionContent: Record<string, unknown>;
}): SuggestionApplySpan | null {
  const span = spanForSuggestionComment(args);
  if (!span) return null;
  if (isWholeFieldIntent(args.comment) || args.comment.kind === "ai_redraft") {
    return { ...span, wholeField: true };
  }
  // Table ops advertise wholeField for bulk-overlap clustering; supersession
  // uses range containment, so strip that flag.
  const payload = parseAiFixCommentContent(args.comment.content);
  if (payload.tableOperation || payload.tableOperationInvalid) {
    return { ...span, wholeField: false };
  }
  return span;
}

function isNewer(b: CommentRecord, a: CommentRecord): boolean {
  if (b.createdAt !== a.createdAt) return b.createdAt > a.createdAt;
  return b.id > a.id;
}

/**
 * A is superseded by B when B is newer, targets the same field, and B's
 * operation ranges fully cover A's. A whole-field intent (draft_field /
 * redraft) supersedes every older open suggestion on that field.
 */
export function findSupersededSuggestions(args: {
  section: SectionType;
  comments: readonly CommentRecord[];
  sectionContent: Record<string, unknown>;
}): SupersessionPair[] {
  const open = args.comments.filter(
    (comment) =>
      !comment.parentId &&
      comment.status === "open" &&
      comment.section === args.section
  );
  const spans = new Map<string, SuggestionApplySpan>();
  for (const comment of open) {
    const span = coveringSpan({
      section: args.section,
      comment,
      sectionContent: args.sectionContent,
    });
    if (span) spans.set(comment.id, span);
  }

  const bestBySuperseded = new Map<string, string>();
  for (const b of open) {
    const spanB = spans.get(b.id);
    if (!spanB) continue;
    for (const a of open) {
      if (a.id === b.id) continue;
      if (!isNewer(b, a)) continue;
      const spanA = spans.get(a.id);
      if (!spanA) continue;
      if (!suggestionApplySpanContains(spanB, spanA)) continue;
      const current = bestBySuperseded.get(a.id);
      if (!current) {
        bestBySuperseded.set(a.id, b.id);
        continue;
      }
      const currentComment = open.find((c) => c.id === current);
      if (currentComment && isNewer(b, currentComment)) {
        bestBySuperseded.set(a.id, b.id);
      }
    }
  }

  return [...bestBySuperseded.entries()].map(([supersededId, supersededBy]) => ({
    supersededId,
    supersededBy,
  }));
}

export function suggestionsSupersededBy(
  comment: CommentRecord,
  args: {
    section: SectionType;
    comments: readonly CommentRecord[];
    sectionContent: Record<string, unknown>;
  }
): CommentRecord[] {
  const ids = new Set(
    findSupersededSuggestions(args)
      .filter((pair) => pair.supersededBy === comment.id)
      .map((pair) => pair.supersededId)
  );
  return args.comments.filter((c) => ids.has(c.id));
}

export function resolutionReasonSupersededBy(commentId: string): string {
  return `${SUPERSEDED_BY_PREFIX}${commentId}`;
}

export function parseSupersededById(reason: string | undefined): string | null {
  if (!reason?.startsWith(SUPERSEDED_BY_PREFIX)) return null;
  const id = reason.slice(SUPERSEDED_BY_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

export function parseResolutionReason(content: string): string | undefined {
  try {
    const parsed = JSON.parse(content) as { resolutionReason?: unknown };
    if (parsed && typeof parsed.resolutionReason === "string") {
      return parsed.resolutionReason;
    }
  } catch {
    // plain content
  }
  return undefined;
}

export function withResolutionReason(content: string, reason: string): string {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return JSON.stringify({ ...parsed, resolutionReason: reason });
    }
  } catch {
    // wrap plain content
  }
  return JSON.stringify({ insertText: content, resolutionReason: reason });
}

export function stripResolutionReason(content: string): string {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const rest = { ...parsed };
      delete rest.resolutionReason;
      return JSON.stringify(rest);
    }
  } catch {
    // plain content
  }
  return content;
}

export function isSupersededDismissal(comment: Pick<CommentRecord, "status" | "content">): boolean {
  if (comment.status !== "dismissed") return false;
  return parseSupersededById(parseResolutionReason(comment.content)) !== null;
}

export function formatSupersedesBadge(count: number): string {
  if (count <= 0) return "";
  return count === 1
    ? "Supersedes 1 pending suggestion"
    : `Supersedes ${count} pending suggestions`;
}
