import type { SectionType } from "@/db/schema";
import type { CommentRecord } from "@/types/report";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import {
  parseAiFixCommentContent,
  parseAiRedraftCommentContent,
} from "@/lib/ai/suggestion-gating";
import {
  acceptPendingNarrativeSuggestion,
  applyNarrativeSuggestion,
  buildSuggestionEdit,
  narrativeHasSuggestionMarks,
  removePendingNarrativeSuggestion,
} from "@/lib/suggestions/apply-narrative-suggestion";
import { applyStructuredFieldSuggestion } from "@/lib/suggestions/apply-field";
import { applyRedraftToSection } from "@/lib/suggestions/apply-redraft";
import {
  isApplyableStatus,
  type LocateStatus,
  probePlainEdit,
  probeRichEdit,
} from "@/lib/suggestions/locator";
import {
  CommentPersistError,
  patchCommentStatus,
} from "@/lib/suggestions/persist-comment-status";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { getRichFieldValue, setRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { resolveSuggestionFieldPath } from "@/lib/suggestions/resolve-suggestion-field-path";
import { suggestionEditFromComment } from "@/lib/suggestions/validate-suggestion";

export type AcceptSuggestionResult =
  | { ok: true; nextSection: Record<string, unknown> }
  | {
      ok: false;
      reason: LocateStatus | "save_failed" | "status_failed";
      error?: unknown;
    };

export type DismissSuggestionResult =
  | { ok: true; nextSection: Record<string, unknown> | null }
  | { ok: false; reason: "status_failed" | "save_failed"; error?: unknown };

async function patchSection(
  reportId: string,
  section: SectionType,
  content: Record<string, unknown>
): Promise<boolean> {
  const res = await fetch(`/api/reports/${reportId}/sections/${section}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  return res.ok;
}

/**
 * Single writer for accepting an AI suggestion from any UI surface.
 * Order: locate → apply → PATCH section → flip comment status.
 * A failure before the status flip leaves the comment open.
 */
export async function acceptSuggestion(args: {
  reportId: string;
  section: SectionType;
  comment: CommentRecord;
  sectionContent: Record<string, unknown>;
  /** Optional field path override for plain-text editors with legacy paths. */
  fieldContentPath?: string;
}): Promise<AcceptSuggestionResult> {
  const { reportId, section, comment, sectionContent, fieldContentPath } = args;
  const path = resolveSuggestionFieldPath(
    section,
    comment.contentPath,
    fieldContentPath ?? comment.contentPath ?? "narrative"
  );

  if (comment.kind === "ai_redraft") {
    const redraft = parseAiRedraftCommentContent(comment.content);
    const nextSection = applyRedraftToSection(
      sectionContent,
      section,
      path,
      redraft.markdown
    );
    if (!(await patchSection(reportId, section, nextSection))) {
      return { ok: false, reason: "save_failed" };
    }
    try {
      await patchCommentStatus(reportId, comment.id, "resolved");
    } catch (error) {
      return { ok: false, reason: "status_failed", error };
    }
    return { ok: true, nextSection };
  }

  const edit = suggestionEditFromComment(comment);

  if (isRichTargetField(section, path)) {
    const doc = getRichFieldValue(sectionContent, path);
    const status = probeRichEdit(doc, edit);
    if (!isApplyableStatus(status) && !narrativeHasSuggestionMarks(doc, comment.id)) {
      return { ok: false, reason: status };
    }
    const nextDoc = narrativeHasSuggestionMarks(doc, comment.id)
      ? acceptPendingNarrativeSuggestion(doc, comment.id)
      : applyNarrativeSuggestion(doc, comment.id, edit);
    const nextSection = setRichFieldValue(sectionContent, path, nextDoc);
    if (!(await patchSection(reportId, section, nextSection))) {
      return { ok: false, reason: "save_failed" };
    }
    try {
      await patchCommentStatus(reportId, comment.id, "resolved");
    } catch (error) {
      return { ok: false, reason: "status_failed", error };
    }
    return { ok: true, nextSection };
  }

  const plain = getPlainTextFieldValue(sectionContent, path);
  const status = probePlainEdit(plain, edit);
  if (!isApplyableStatus(status)) {
    return { ok: false, reason: status };
  }

  const payload = parseAiFixCommentContent(comment.content);
  let nextSection: Record<string, unknown>;
  try {
    nextSection = applyStructuredFieldSuggestion(
      sectionContent,
      path,
      payload.insertText,
      payload.deleteText,
      comment.anchorText
    );
  } catch {
    return { ok: false, reason: "not_found" };
  }

  if (!(await patchSection(reportId, section, nextSection))) {
    return { ok: false, reason: "save_failed" };
  }
  try {
    await patchCommentStatus(reportId, comment.id, "resolved");
  } catch (error) {
    return { ok: false, reason: "status_failed", error };
  }
  return { ok: true, nextSection };
}

/**
 * Single writer for dismissing an AI suggestion.
 * Order: strip rich preview marks (if any) → PATCH section (if changed) → flip status.
 * Plain fields have no marks to strip.
 */
export async function dismissSuggestion(args: {
  reportId: string;
  section: SectionType;
  comment: CommentRecord;
  sectionContent: Record<string, unknown>;
  fieldContentPath?: string;
}): Promise<DismissSuggestionResult> {
  const { reportId, section, comment, sectionContent, fieldContentPath } = args;
  const path = resolveSuggestionFieldPath(
    section,
    comment.contentPath,
    fieldContentPath ?? comment.contentPath ?? "narrative"
  );

  let nextSection: Record<string, unknown> | null = null;

  if (isRichTargetField(section, path)) {
    const doc = getRichFieldValue(sectionContent, path);
    if (narrativeHasSuggestionMarks(doc, comment.id)) {
      const nextDoc = removePendingNarrativeSuggestion(doc, comment.id);
      nextSection = setRichFieldValue(sectionContent, path, nextDoc);
      if (!(await patchSection(reportId, section, nextSection))) {
        return { ok: false, reason: "save_failed" };
      }
    }
  }

  try {
    await patchCommentStatus(reportId, comment.id, "dismissed");
  } catch (error) {
    return { ok: false, reason: "status_failed", error };
  }

  return { ok: true, nextSection };
}

export { CommentPersistError, buildSuggestionEdit };
