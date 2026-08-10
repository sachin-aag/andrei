import { AI_AUTHOR_ID } from "@/lib/ai/constants";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import {
  acceptSuggestionMarksById,
  applyAndAcceptRichEdit,
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

export type { SuggestionEdit };

export function buildSuggestionEdit(payload: {
  anchorText?: string | null;
  deleteText: string;
  insertText: string;
  scope?: EditScope;
}): SuggestionEdit {
  return {
    anchorText: payload.anchorText?.trim() ?? "",
    deleteText: payload.deleteText,
    insertText: normalizeSuggestionInsertText(payload.insertText),
    scope: payload.scope,
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
  return found;
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

/** Remove pending suggestion marks if present (legacy pre-apply injections). */
export function removePendingNarrativeSuggestion(
  narrative: JSONContent,
  suggestionId: string
): JSONContent {
  return stripSuggestionMarksById(narrative, suggestionId);
}
