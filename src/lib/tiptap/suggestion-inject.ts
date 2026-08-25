import type { JSONContent } from "@tiptap/core";
import { AI_AUTHOR_ID } from "@/lib/ai/constants";
import {
  acceptSuggestionMarksById as acceptMarks,
  applyEditToRichDoc,
  isApplyableStatus,
  stripSuggestionMarksById as stripMarks,
  type InjectAttrs,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";

/**
 * Compatibility façade over the single locator (`src/lib/suggestions/locator.ts`).
 * New code should call locator helpers directly; this module preserves the
 * historical inject/accept API used by TipTap preview widgets.
 */

export type { SuggestionEdit };

export type InjectResult = {
  doc: JSONContent;
  /** Edit was attached to the anchor/delete target (vs appended at end). */
  anchored: boolean;
  /**
   * Edit landed where the AI intended. An empty anchor is an intentional
   * append (located). A provided anchor/delete target that cannot be found
   * returns `located: false` with the doc UNCHANGED.
   */
  located: boolean;
};

export function injectSuggestionMarks(
  doc: JSONContent,
  edit: SuggestionEdit,
  attrs: InjectAttrs
): InjectResult {
  const result = applyEditToRichDoc(doc, edit, attrs);
  const located = isApplyableStatus(result.status);
  return {
    doc: located ? result.doc : doc,
    anchored: result.status === "located",
    located,
  };
}

export function acceptSuggestionMarksById(
  doc: JSONContent,
  markId: string
): JSONContent {
  return acceptMarks(doc, markId);
}

export function stripSuggestionMarksById(
  doc: JSONContent,
  markId: string
): JSONContent {
  return stripMarks(doc, markId);
}

/** Replace all insert-mark text for a suggestion id. */
export function replaceSuggestionInsertPlainText(
  doc: JSONContent,
  markId: string,
  newText: string
): JSONContent {
  const cloned: JSONContent = JSON.parse(JSON.stringify(doc));
  const hits: Array<{ parentArr: JSONContent[]; index: number; node: JSONContent }> =
    [];

  function walk(
    node: JSONContent,
    parentArr: JSONContent[] | null,
    index: number
  ) {
    if (node.type === "text" && node.marks?.length) {
      const isInsert = node.marks.some(
        (m) =>
          m.type === "suggestionInsert" &&
          (m.attrs as { id?: string } | undefined)?.id === markId
      );
      if (isInsert && parentArr) {
        hits.push({ parentArr, index, node });
      }
    }
    if (node.content?.length) {
      for (let i = 0; i < node.content.length; i++) {
        walk(node.content[i]!, node.content, i);
      }
    }
  }

  walk(cloned, null, 0);
  if (hits.length === 0) return cloned;

  hits[0]!.node.text = newText;
  for (let i = hits.length - 1; i >= 1; i--) {
    const { parentArr, index } = hits[i]!;
    parentArr.splice(index, 1);
  }
  return cloned;
}

export function collectPendingSuggestionMarkIds(
  doc: JSONContent,
  authorId?: string
): string[] {
  const ids = new Set<string>();

  function visit(node: JSONContent) {
    if (node.type === "text" && node.marks?.length) {
      for (const mark of node.marks) {
        if (
          mark.type !== "suggestionInsert" &&
          mark.type !== "suggestionDelete"
        ) {
          continue;
        }
        const attrs = mark.attrs as {
          id?: string | null;
          status?: string;
          authorId?: string;
        };
        if (attrs?.status !== "pending") continue;
        if (authorId != null && attrs.authorId !== authorId) continue;
        if (attrs.id) ids.add(attrs.id);
      }
    }
    const suggestionId = (node.attrs as { suggestionId?: string | null } | undefined)
      ?.suggestionId;
    if (node.type === "imageInline" && suggestionId) ids.add(suggestionId);
    node.content?.forEach(visit);
  }

  visit(doc);
  return [...ids];
}

/** True when two rich docs match aside from editor-local AI suggestion previews. */
export function richDocsMatchIgnoringAiPreview(
  a: JSONContent,
  b: JSONContent
): boolean {
  return (
    JSON.stringify(stripPendingSuggestionsExcept(a, null)) ===
    JSON.stringify(stripPendingSuggestionsExcept(b, null))
  );
}

/**
 * Skip rewriting the live editor doc (inject / strip / setContent) while the
 * reviewer is typing. Replacing the doc on each keystroke drops the caret and
 * the new letters — which is what "cannot type next to an unaccepted AI
 * suggestion" feels like.
 *
 * Still allow the first inject when the field is focused but unchanged, so the
 * preview can appear after comments load.
 */
export function shouldSkipSuggestionDocSync(opts: {
  hasFocus: boolean;
  previewHeld: boolean;
  needsInject: boolean;
  hasLocalEdits: boolean;
}): boolean {
  if (opts.previewHeld) return false;
  if (!opts.hasFocus) return false;
  if (opts.needsInject && !opts.hasLocalEdits) return false;
  return true;
}

export function stripPendingSuggestionsExcept(
  doc: JSONContent,
  keepMarkId: string | null
): JSONContent {
  let result = doc;
  for (const id of collectPendingSuggestionMarkIds(doc, AI_AUTHOR_ID)) {
    if (keepMarkId && id === keepMarkId) continue;
    result = stripSuggestionMarksById(result, id);
  }
  return result;
}
