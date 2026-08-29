import type { JSONContent } from "@tiptap/core";
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
  applyNarrativeSuggestionAsRevision,
  buildSuggestionEdit,
  commitNarrativeSuggestionMarks,
  narrativeHasSuggestionMarks,
  removePendingNarrativeSuggestion,
} from "@/lib/suggestions/apply-narrative-suggestion";
import { applyStructuredFieldSuggestion } from "@/lib/suggestions/apply-field";
import { applyRedraftToSection } from "@/lib/suggestions/apply-redraft";
import { AI_AUTHOR_ID } from "@/lib/ai/constants";
import { buildRedraftPreviewDoc } from "@/lib/tiptap/redraft-preview";
import { markdownToDoc } from "@/lib/tiptap/markdown-to-doc";
import type { SuggestionApplyMode } from "@/lib/document-types";
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
import { withResolutionReason } from "@/lib/suggestions/resolution-reason";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { getRichFieldValue, setRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { resolveSuggestionFieldPath } from "@/lib/suggestions/resolve-suggestion-field-path";
import { applyTableOperation } from "@/lib/suggestions/table-operation";
import { suggestionEditFromComment } from "@/lib/suggestions/validate-suggestion";
import type { PlannedOperation } from "@/lib/suggestions/diff-plan";
import {
  persistMergedAsTrackedChange,
  resolveSuggestionMerge,
  writeMergedField,
} from "@/lib/suggestions/resolve-merge";

export type AcceptSuggestionResult =
  | {
      ok: true;
      nextSection: Record<string, unknown>;
      remainder?: "conflict";
    }
  | {
      ok: false;
      reason: LocateStatus | "noop" | "save_failed" | "status_failed";
      error?: unknown;
    };

export type DismissSuggestionResult =
  | { ok: true; nextSection: Record<string, unknown> | null }
  | { ok: false; reason: "status_failed" | "save_failed"; error?: unknown };

export class SectionPersistError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SectionPersistError";
    this.status = status;
  }
}

export type ApplySuggestionToContentArgs = {
  section: SectionType;
  comment: CommentRecord;
  sectionContent: Record<string, unknown>;
  fieldContentPath?: string;
  applyMode?: SuggestionApplyMode;
};

export type ApplySuggestionToContentResult =
  | {
      ok: true;
      nextSection: Record<string, unknown>;
      remainder?: "conflict";
      operations?: PlannedOperation[];
    }
  | { ok: false; reason: LocateStatus | "noop" };

/**
 * Locate and apply one suggestion in memory. No network. Bulk apply uses this
 * so a section can persist once after every locatable edit is in the doc.
 */
export function applySuggestionToContent(
  args: ApplySuggestionToContentArgs
): ApplySuggestionToContentResult {
  const {
    section,
    comment,
    sectionContent,
    fieldContentPath,
    applyMode = "final",
  } = args;
  const persistAsTrackedChange = applyMode === "tracked_change";
  const path = resolveSuggestionFieldPath(
    section,
    comment.contentPath,
    fieldContentPath ?? comment.contentPath ?? "narrative"
  );

  const resolved = resolveSuggestionMerge({
    section,
    comment,
    sectionContent,
    fieldContentPath,
  });
  if (resolved.merge) {
    if (resolved.merge.status === "noop") {
      return { ok: false, reason: "noop" };
    }
    const merged = resolved.merge.merged;
    let nextSection = writeMergedField({
      sectionContent,
      section,
      path: resolved.path,
      merged,
    });
    if (
      persistAsTrackedChange &&
      isRichTargetField(section, resolved.path) &&
      typeof resolved.current !== "string" &&
      typeof merged !== "string"
    ) {
      nextSection = setRichFieldValue(
        sectionContent,
        resolved.path,
        persistMergedAsTrackedChange({
          current: resolved.current,
          merged,
          commentId: comment.id,
          createdAt: comment.createdAt,
        })
      );
    }
    return {
      ok: true,
      nextSection,
      remainder: resolved.merge.status === "conflict" ? "conflict" : undefined,
      operations: resolved.operations,
    };
  }

  if (comment.kind === "ai_redraft") {
    const redraft = parseAiRedraftCommentContent(comment.content);
    const nextSection =
      persistAsTrackedChange && isRichTargetField(section, path)
        ? setRichFieldValue(
            sectionContent,
            path,
            commitNarrativeSuggestionMarks(
              buildRedraftPreviewDoc(
                getRichFieldValue(sectionContent, path),
                markdownToDoc(redraft.markdown, { headingNodes: true }),
                {
                  id: comment.id,
                  authorId: AI_AUTHOR_ID,
                  status: "pending",
                  createdAt: new Date().toISOString(),
                  kind: "redraft",
                }
              ),
              comment.id
            )
          )
        : applyRedraftToSection(
            sectionContent,
            section,
            path,
            redraft.markdown,
            { headingNodes: persistAsTrackedChange }
          );
    return { ok: true, nextSection };
  }

  const payload = parseAiFixCommentContent(comment.content);
  if (payload.tableOperationInvalid) {
    return { ok: false, reason: "not_found" };
  }
  if (payload.tableOperation) {
    if (!isRichTargetField(section, path)) {
      return { ok: false, reason: "not_found" };
    }
    const doc = getRichFieldValue(sectionContent, path);
    const result = applyTableOperation(doc, payload.tableOperation, {
      section,
      targetField: path,
    });
    if (!result.ok) {
      return { ok: false, reason: "not_found" };
    }
    let nextDoc = result.doc;
    if (payload.second) {
      try {
        const secondEdit = {
          anchorText: payload.second.anchorText,
          deleteText: payload.second.deleteText,
          insertText: payload.second.insertText,
          scope: payload.second.scope,
        };
        nextDoc =
          applyMode === "tracked_change"
            ? applyNarrativeSuggestionAsRevision(nextDoc, comment.id, secondEdit)
            : applyNarrativeSuggestion(nextDoc, comment.id, secondEdit);
      } catch {
        return { ok: false, reason: "not_found" };
      }
    }
    if (persistAsTrackedChange) {
      nextDoc = commitNarrativeSuggestionMarks(nextDoc, comment.id);
    }
    return { ok: true, nextSection: setRichFieldValue(sectionContent, path, nextDoc) };
  }

  const edit = suggestionEditFromComment(comment);

  if (isRichTargetField(section, path)) {
    const persistMarks = applyMode === "tracked_change";
    const doc = getRichFieldValue(sectionContent, path);
    const alreadyMarked = narrativeHasSuggestionMarks(doc, comment.id);
    const status = probeRichEdit(doc, edit);
    if (!isApplyableStatus(status) && !alreadyMarked) {
      return { ok: false, reason: status };
    }
    let nextDoc: JSONContent;
    if (persistMarks) {
      nextDoc = alreadyMarked
        ? doc
        : applyNarrativeSuggestionAsRevision(doc, comment.id, edit);
      nextDoc = commitNarrativeSuggestionMarks(nextDoc, comment.id);
    } else {
      nextDoc = alreadyMarked
        ? acceptPendingNarrativeSuggestion(doc, comment.id)
        : applyNarrativeSuggestion(doc, comment.id, edit);
    }
    return { ok: true, nextSection: setRichFieldValue(sectionContent, path, nextDoc) };
  }

  const plain = getPlainTextFieldValue(sectionContent, path);
  const status = probePlainEdit(plain, edit);
  if (!isApplyableStatus(status)) {
    return { ok: false, reason: status };
  }

  try {
    return {
      ok: true,
      nextSection: applyStructuredFieldSuggestion(
        sectionContent,
        path,
        payload.insertText,
        payload.deleteText,
        comment.anchorText,
        payload.second
      ),
    };
  } catch {
    return { ok: false, reason: "not_found" };
  }
}

/** Strip pending preview marks for one suggestion. Null when the field is unchanged. */
export function stripSuggestionFromContent(args: {
  section: SectionType;
  comment: CommentRecord;
  sectionContent: Record<string, unknown>;
  fieldContentPath?: string;
}): Record<string, unknown> | null {
  const path = resolveSuggestionFieldPath(
    args.section,
    args.comment.contentPath,
    args.fieldContentPath ?? args.comment.contentPath ?? "narrative"
  );
  if (!isRichTargetField(args.section, path)) return null;
  const doc = getRichFieldValue(args.sectionContent, path);
  if (!narrativeHasSuggestionMarks(doc, args.comment.id)) return null;
  return setRichFieldValue(
    args.sectionContent,
    path,
    removePendingNarrativeSuggestion(doc, args.comment.id)
  );
}

export async function patchSection(
  reportId: string,
  section: SectionType,
  content: Record<string, unknown>
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/reports/${reportId}/sections/${section}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch {
    throw new SectionPersistError(0, "Could not save section. Please try again.");
  }
  if (res.ok) return;
  if (res.status === 403) {
    throw new SectionPersistError(
      403,
      "You can't save changes to this report."
    );
  }
  throw new SectionPersistError(
    res.status,
    `Save failed (${res.status})`
  );
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
  /** How to persist the applied edit. Default `final` (investigation/DV). */
  applyMode?: SuggestionApplyMode;
}): Promise<AcceptSuggestionResult> {
  const applied = applySuggestionToContent(args);
  if (!applied.ok) {
    if (applied.reason === "noop") {
      try {
        await patchCommentStatus(
          args.reportId,
          args.comment.id,
          "dismissed",
          {
            content: withResolutionReason(
              args.comment.content,
              "already_present"
            ),
          }
        );
      } catch (error) {
        return { ok: false, reason: "status_failed", error };
      }
      return { ok: true, nextSection: args.sectionContent };
    }
    return applied;
  }
  try {
    await patchSection(args.reportId, args.section, applied.nextSection);
  } catch (error) {
    return { ok: false, reason: "save_failed", error };
  }
  if (applied.remainder === "conflict") {
    return {
      ok: true,
      nextSection: applied.nextSection,
      remainder: "conflict",
    };
  }
  try {
    await patchCommentStatus(args.reportId, args.comment.id, "resolved", {
      operations: applied.operations?.map((op) => ({
        opIndex: op.opIndex,
        coverage: op.coverage,
        classification: op.classification,
      })),
    });
  } catch (error) {
    return { ok: false, reason: "status_failed", error };
  }
  return { ok: true, nextSection: applied.nextSection };
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
  const nextSection = stripSuggestionFromContent(args);
  if (nextSection) {
    try {
      await patchSection(args.reportId, args.section, nextSection);
    } catch (error) {
      return { ok: false, reason: "save_failed", error };
    }
  }

  try {
    await patchCommentStatus(args.reportId, args.comment.id, "dismissed");
  } catch (error) {
    return { ok: false, reason: "status_failed", error };
  }

  return { ok: true, nextSection };
}

export { CommentPersistError, buildSuggestionEdit };
