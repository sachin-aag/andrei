import { AI_AUTHOR_ID } from "@/lib/ai/constants";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import {
  acceptSuggestionMarksById,
  injectSuggestionMarks,
  stripSuggestionMarksById,
  type SuggestionEdit,
} from "@/lib/tiptap/suggestion-inject";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import type { JSONContent } from "@tiptap/core";

export function buildSuggestionEdit(payload: {
  anchorText?: string | null;
  deleteText: string;
  insertText: string;
}): SuggestionEdit {
  return {
    anchorText: payload.anchorText?.trim() ?? "",
    deleteText: payload.deleteText,
    insertText: normalizeSuggestionInsertText(payload.insertText),
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
          (m.type === suggestionInsertMarkName || m.type === suggestionDeleteMarkName)
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
  const injected = injectSuggestionMarks(narrative, edit, {
    id: suggestionId,
    authorId: AI_AUTHOR_ID,
    status: "pending",
    createdAt: new Date().toISOString(),
    kind: "fix",
  });
  return acceptSuggestionMarksById(injected.doc, suggestionId);
}

/** Remove pending suggestion marks if present (legacy pre-apply injections). */
export function removePendingNarrativeSuggestion(
  narrative: JSONContent,
  suggestionId: string
): JSONContent {
  return stripSuggestionMarksById(narrative, suggestionId);
}
