import { AI_AUTHOR_ID } from "@/lib/ai/constants";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import {
  acceptSuggestionMarksById,
  applyAndAcceptRichEdit,
  applyEditToRichDoc,
  isApplyableStatus,
  stripSuggestionMarksById,
  type EditScope,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import type { JSONContent } from "@tiptap/core";
import { docHasPendingImageSuggestion } from "@/lib/suggestions/image-insert";

export type { SuggestionEdit };

export function buildSuggestionEdit(payload: {
  anchorText?: string | null;
  deleteText: string;
  insertText: string;
  insertImage?: SuggestionEdit["insertImage"];
  removeImage?: SuggestionEdit["removeImage"];
  scope?: EditScope;
  second?: SuggestionEdit["second"];
}): SuggestionEdit {
  const second = payload.second
    ? {
        anchorText: payload.second.anchorText?.trim() ?? "",
        deleteText: payload.second.deleteText,
        insertText: normalizeSuggestionInsertText(payload.second.insertText),
        insertImage: payload.second.insertImage,
        scope: payload.second.scope,
      }
    : undefined;
  return {
    anchorText: payload.anchorText?.trim() ?? "",
    deleteText: payload.deleteText,
    insertText: normalizeSuggestionInsertText(payload.insertText),
    insertImage: payload.insertImage,
    removeImage: payload.removeImage,
    scope: payload.scope,
    second:
      second &&
      (second.deleteText.trim() ||
        second.insertText.trim() ||
        second.insertImage)
        ? second
        : undefined,
  };
}

export function narrativeHasSuggestionMarks(
  narrative: JSONContent,
  suggestionId: string
): boolean {
  let found = false;
  const walk = (node: JSONContent) => {
    if (found) return;
    if (node.type === "text" && node.marks?.length) {
      for (const m of node.marks) {
        const attrs = m.attrs as { id?: string } | undefined;
        if (
          attrs?.id === suggestionId &&
          (m.type === suggestionInsertMarkName ||
            m.type === suggestionDeleteMarkName)
        ) {
          found = true;
          return;
        }
      }
    }
    node.content?.forEach(walk);
  };
  walk(narrative);
  return found || docHasPendingImageSuggestion(narrative, suggestionId);
}

/** Finalize pending inline marks (preview → normal text). */
export function acceptPendingNarrativeSuggestion(
  narrative: JSONContent,
  suggestionId: string
): JSONContent {
  return acceptSuggestionMarksById(narrative, suggestionId);
}

/** Commit a narrative suggestion when preview marks are missing (inject + accept). */
export function applyNarrativeSuggestion(
  narrative: JSONContent,
  suggestionId: string,
  edit: SuggestionEdit
): JSONContent {
  const result = applyAndAcceptRichEdit(narrative, suggestionId, edit, {
    authorId: AI_AUTHOR_ID,
  });
  if (!isApplyableStatus(result.status)) {
    throw new Error("Suggestion could not be located in the current text");
  }
  return result.doc;
}

/**
 * Inject insert/delete marks and leave them pending so Word export can emit
 * `<w:ins>` / `<w:del>`. Used by generic documents; investigation/DV still
 * call `applyNarrativeSuggestion` (finalize).
 */
export function applyNarrativeSuggestionAsRevision(
  narrative: JSONContent,
  suggestionId: string,
  edit: SuggestionEdit
): JSONContent {
  const result = applyEditToRichDoc(narrative, edit, {
    id: suggestionId,
    authorId: AI_AUTHOR_ID,
    status: "pending",
    createdAt: new Date().toISOString(),
    kind: "fix",
  });
  if (!isApplyableStatus(result.status)) {
    throw new Error("Suggestion could not be located in the current text");
  }
  return result.doc;
}

/** Remove pending suggestion marks if present (legacy pre-apply injections). */
export function removePendingNarrativeSuggestion(
  narrative: JSONContent,
  suggestionId: string
): JSONContent {
  return stripSuggestionMarksById(narrative, suggestionId);
}
