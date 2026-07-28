import type { JSONContent } from "@tiptap/core";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
  type SuggestionStatus,
  type SuggestionKind,
} from "@/lib/tiptap/suggestion-marks";

export type RedraftPreviewAttrs = {
  id: string;
  authorId: string;
  status: SuggestionStatus;
  createdAt: string;
  kind: SuggestionKind;
};

function markAllText(node: JSONContent, markName: string, attrs: RedraftPreviewAttrs): void {
  if (node.type === "text") {
    node.marks = [...(node.marks ?? []), { type: markName, attrs: { ...attrs } }];
    return;
  }
  node.content?.forEach((ch) => markAllText(ch, markName, attrs));
}

function docHasText(doc: JSONContent): boolean {
  if (doc.type === "text") return (doc.text ?? "").trim().length > 0;
  return (doc.content ?? []).some(docHasText);
}

/**
 * In-editor preview of a full-field redraft as tracked changes: the current
 * content struck through (delete marks) followed by the replacement content
 * highlighted (insert marks). The standard mark machinery then works —
 * `acceptSuggestionMarksById` yields the replacement, `stripSuggestionMarksById`
 * restores the original.
 */
export function buildRedraftPreviewDoc(
  currentDoc: JSONContent,
  replacementDoc: JSONContent,
  attrs: RedraftPreviewAttrs
): JSONContent {
  const replacement: JSONContent = JSON.parse(JSON.stringify(replacementDoc));
  markAllText(replacement, suggestionInsertMarkName, attrs);

  if (!docHasText(currentDoc)) {
    return replacement;
  }

  const current: JSONContent = JSON.parse(JSON.stringify(currentDoc));
  markAllText(current, suggestionDeleteMarkName, attrs);

  return {
    type: "doc",
    content: [...(current.content ?? []), ...(replacement.content ?? [])],
  };
}
