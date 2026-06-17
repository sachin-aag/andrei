import type { JSONContent } from "@tiptap/core";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import {
  findAnchorInText,
  collapseWhitespace,
  countOccurrences,
} from "@/lib/text/normalize-for-anchor";
import { AI_AUTHOR_ID } from "@/lib/ai/constants";
import {
  suggestionInsertMarkName,
  suggestionDeleteMarkName,
  type SuggestionKind,
  type SuggestionStatus,
} from "@/lib/tiptap/suggestion-marks";
import { finalizeNarrativeDocAfterSuggestion } from "@/lib/tiptap/finalize-narrative-doc";

/**
 * Server-side equivalent of Tiptap's editor commands for inserting an AI
 * suggestion as a tracked-change pair directly in the persisted JSON doc.
 */

export type SuggestionEdit = {
  anchorText: string;
  deleteText: string;
  insertText: string;
};

type InjectAttrs = {
  id: string;
  authorId: string;
  status: SuggestionStatus;
  createdAt: string;
  kind: SuggestionKind;
};

export type InjectResult = {
  doc: JSONContent;
  insertFromPos: number;
  insertToPos: number;
  anchored: boolean;
};

type TextRef = {
  node: JSONContent;
  parentArr: JSONContent[];
  indexInParent: number;
  flatStart: number;
  flatEnd: number;
};

function collectTextRefs(doc: JSONContent): { refs: TextRef[]; flat: string } {
  const refs: TextRef[] = [];
  let flat = "";

  function visit(node: JSONContent, parentArr: JSONContent[] | null, idx: number) {
    if (node.type === "text") {
      const text = node.text ?? "";
      const start = flat.length;
      flat += text;
      if (parentArr) {
        refs.push({
          node,
          parentArr,
          indexInParent: idx,
          flatStart: start,
          flatEnd: start + text.length,
        });
      }
      return;
    }
    if (node.content?.length) {
      const arr = node.content;
      for (let i = 0; i < arr.length; i++) {
        visit(arr[i]!, arr, i);
        if (
          i < arr.length - 1 &&
          (node.type === "doc" ||
            node.type === "paragraph" ||
            node.type === "heading" ||
            node.type === "tableCell" ||
            node.type === "tableHeader")
        ) {
          flat += " ";
        }
      }
    }
  }

  visit(doc, null, 0);
  return { refs, flat };
}

function indexPmPositions(doc: JSONContent): Map<JSONContent, { pmStart: number; pmEnd: number }> {
  const map = new Map<JSONContent, { pmStart: number; pmEnd: number }>();

  function walk(node: JSONContent, pos: number): number {
    if (node.type === "text") {
      const len = (node.text ?? "").length;
      map.set(node, { pmStart: pos, pmEnd: pos + len });
      return pos + len;
    }
    if (node.type === "doc") {
      let cursor = pos;
      for (const ch of node.content ?? []) cursor = walk(ch, cursor);
      return cursor;
    }
    let cursor = pos + 1;
    if (node.content?.length) {
      for (const ch of node.content) cursor = walk(ch, cursor);
    }
    return cursor + 1;
  }

  walk(doc, 0);
  return map;
}

function splitTextNode(
  ref: TextRef,
  localStart: number,
  localEnd: number,
  attrs: InjectAttrs
) {
  const original = ref.node.text ?? "";
  const before = original.slice(0, localStart);
  const middle = original.slice(localStart, localEnd);
  const after = original.slice(localEnd);

  const baseMarks = ref.node.marks ?? [];
  const deleteMark = {
    type: suggestionDeleteMarkName,
    attrs: { ...attrs },
  };

  const replacements: JSONContent[] = [];
  if (before.length > 0) {
    replacements.push({
      type: "text",
      text: before,
      marks: baseMarks.length ? baseMarks : undefined,
    });
  }
  if (middle.length > 0) {
    replacements.push({
      type: "text",
      text: middle,
      marks: [...baseMarks, deleteMark],
    });
  }
  if (after.length > 0) {
    replacements.push({
      type: "text",
      text: after,
      marks: baseMarks.length ? baseMarks : undefined,
    });
  }

  ref.parentArr.splice(ref.indexInParent, 1, ...replacements);
}

function cleanupMarks(node: JSONContent) {
  if (node.marks?.length === 0) delete node.marks;
  if (node.content?.length) for (const ch of node.content) cleanupMarks(ch);
}

function findRangeInFlat(
  flat: string,
  needle: string
): { start: number; end: number } | null {
  const match = findAnchorInText(flat, needle);
  if (!match) return null;
  return { start: match.start, end: match.end };
}

function applyDeleteRange(
  cloned: JSONContent,
  refs: TextRef[],
  origStart: number,
  origEnd: number,
  attrs: InjectAttrs
): TextRef | null {
  const affected = refs.filter((r) => r.flatEnd > origStart && r.flatStart < origEnd);
  if (affected.length === 0) return null;

  for (let i = affected.length - 1; i >= 0; i--) {
    const r = affected[i]!;
    const localStart = Math.max(0, origStart - r.flatStart);
    const localEnd = Math.min(r.flatEnd - r.flatStart, origEnd - r.flatStart);
    if (localStart >= localEnd) continue;
    splitTextNode(r, localStart, localEnd, attrs);
  }

  const recollected = collectTextRefs(cloned);
  const ourId = attrs.id;
  let insertAfter: TextRef | null = null;
  for (const r of recollected.refs) {
    const hasOurDelete = (r.node.marks ?? []).some(
      (m) =>
        m.type === suggestionDeleteMarkName &&
        (m.attrs as { id?: string } | undefined)?.id === ourId
    );
    if (hasOurDelete) insertAfter = r;
  }
  return insertAfter;
}

function insertAfterRef(
  cloned: JSONContent,
  insertAfter: TextRef | null,
  insertText: string,
  attrs: InjectAttrs
): JSONContent | null {
  const trimmed = normalizeSuggestionInsertText(insertText);
  if (!trimmed) return null;

  const insertMark = {
    type: suggestionInsertMarkName,
    attrs: { ...attrs },
  };
  const insertedNode: JSONContent = {
    type: "text",
    text: trimmed,
    marks: [insertMark],
  };

  if (insertAfter) {
    insertAfter.parentArr.splice(insertAfter.indexInParent + 1, 0, insertedNode);
  } else {
    const para: JSONContent = {
      type: "paragraph",
      content: [insertedNode],
    };
    if (cloned.type !== "doc") return insertedNode;
    cloned.content = [...(cloned.content ?? []), para];
  }
  return insertedNode;
}

function appendAtEnd(
  cloned: JSONContent,
  insertText: string,
  attrs: InjectAttrs
): InjectResult {
  const trimmed = normalizeSuggestionInsertText(insertText);
  if (!trimmed) {
    return { doc: cloned, insertFromPos: 0, insertToPos: 0, anchored: false };
  }
  const insertedNode = insertAfterRef(cloned, null, trimmed, attrs);
  if (!insertedNode) {
    return { doc: cloned, insertFromPos: 0, insertToPos: 0, anchored: false };
  }
  cleanupMarks(cloned);
  const pmIndex = indexPmPositions(cloned);
  const range = pmIndex.get(insertedNode);
  if (!range) return { doc: cloned, insertFromPos: 0, insertToPos: 0, anchored: false };
  return {
    doc: cloned,
    insertFromPos: range.pmStart,
    insertToPos: range.pmEnd,
    anchored: false,
  };
}

export function injectSuggestionMarks(
  doc: JSONContent,
  edit: SuggestionEdit,
  attrs: InjectAttrs
): InjectResult {
  const cloned: JSONContent = JSON.parse(JSON.stringify(doc));

  const anchorText = (edit.anchorText ?? "").trim();
  const deleteText = (edit.deleteText ?? "").trim();
  const insertText = normalizeSuggestionInsertText(edit.insertText ?? "");

  if (!deleteText && !insertText) {
    return { doc: cloned, insertFromPos: 0, insertToPos: 0, anchored: false };
  }

  const { refs, flat } = collectTextRefs(cloned);
  if (flat.length === 0 && insertText) {
    return appendAtEnd(cloned, insertText, attrs);
  }

  // Pure insert after anchor (or append if anchor missing).
  if (!deleteText && insertText) {
    if (!anchorText) return appendAtEnd(cloned, insertText, attrs);
    const anchorRange = findRangeInFlat(flat, anchorText);
    if (!anchorRange) return appendAtEnd(cloned, insertText, attrs);

    // Re-clone and insert text node after anchor span without delete marks.
    const fresh = JSON.parse(JSON.stringify(doc)) as JSONContent;
    const collected = collectTextRefs(fresh);
    const range = findRangeInFlat(collected.flat, anchorText);
    if (!range) return appendAtEnd(fresh, insertText, attrs);
    const affected = collected.refs.filter(
      (r) => r.flatEnd > range.start && r.flatStart < range.end
    );
    const lastRef = affected[affected.length - 1] ?? null;
    const insertedNode = insertAfterRef(fresh, lastRef, insertText, attrs);
    cleanupMarks(fresh);
    if (!insertedNode) return { doc: fresh, insertFromPos: 0, insertToPos: 0, anchored: false };
    const pmIndex = indexPmPositions(fresh);
    const pos = pmIndex.get(insertedNode);
    return {
      doc: fresh,
      insertFromPos: pos?.pmStart ?? 0,
      insertToPos: pos?.pmEnd ?? 0,
      anchored: true,
    };
  }

  // Delete (with optional insert).
  const deleteNeedle = deleteText || anchorText;
  if (!deleteNeedle) return appendAtEnd(cloned, insertText, attrs);

  let deleteRange: { start: number; end: number } | null = null;
  if (anchorText) {
    const anchorRange = findRangeInFlat(flat, anchorText);
    if (anchorRange) {
      const slice = flat.slice(anchorRange.start, anchorRange.end);
      const inner = findRangeInFlat(slice, deleteNeedle);
      if (inner) {
        deleteRange = {
          start: anchorRange.start + inner.start,
          end: anchorRange.start + inner.end,
        };
      } else if (!deleteText) {
        deleteRange = anchorRange;
      }
    }
  }
  deleteRange ??= findRangeInFlat(flat, deleteNeedle);

  if (!deleteRange) {
    if (insertText) return appendAtEnd(cloned, insertText, attrs);
    return { doc: cloned, insertFromPos: 0, insertToPos: 0, anchored: false };
  }

  const insertAfter = applyDeleteRange(cloned, refs, deleteRange.start, deleteRange.end, attrs);
  let insertedNode: JSONContent | null = null;
  if (insertText) {
    insertedNode = insertAfterRef(cloned, insertAfter, insertText, attrs);
  }

  cleanupMarks(cloned);

  if (insertedNode) {
    const pmIndex = indexPmPositions(cloned);
    const range = pmIndex.get(insertedNode);
    return {
      doc: cloned,
      insertFromPos: range?.pmStart ?? 0,
      insertToPos: range?.pmEnd ?? 0,
      anchored: true,
    };
  }

  if (insertAfter) {
    const pmIndex = indexPmPositions(cloned);
    const range = pmIndex.get(insertAfter.node);
    return {
      doc: cloned,
      insertFromPos: range?.pmStart ?? 0,
      insertToPos: range?.pmEnd ?? 0,
      anchored: true,
    };
  }

  return { doc: cloned, insertFromPos: 0, insertToPos: 0, anchored: false };
}

/** Accept: keep insert text (unmarked), remove delete-marked text. */
/** Replace all insert-mark text for a suggestion id (before accept, e.g. after filling placeholders). */
export function replaceSuggestionInsertPlainText(
  doc: JSONContent,
  markId: string,
  newText: string
): JSONContent {
  const cloned: JSONContent = JSON.parse(JSON.stringify(doc));
  const hits: Array<{ parentArr: JSONContent[]; index: number; node: JSONContent }> = [];

  function walk(node: JSONContent, parentArr: JSONContent[] | null, index: number) {
    if (node.type === "text" && node.marks?.length) {
      const isInsert = node.marks.some(
        (m) =>
          m.type === suggestionInsertMarkName &&
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

/** Pending suggestion mark ids present in a narrative doc. */
export function collectPendingSuggestionMarkIds(
  doc: JSONContent,
  authorId?: string
): string[] {
  const ids = new Set<string>();

  function visit(node: JSONContent) {
    if (node.type === "text" && node.marks?.length) {
      for (const mark of node.marks) {
        if (
          mark.type !== suggestionInsertMarkName &&
          mark.type !== suggestionDeleteMarkName
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
    node.content?.forEach(visit);
  }

  visit(doc);
  return [...ids];
}

/** Revert every pending AI suggestion preview except the one currently shown in the UI. */
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

export function acceptSuggestionMarksById(doc: JSONContent, markId: string): JSONContent {
  const cloned: JSONContent = JSON.parse(JSON.stringify(doc));

  function visit(node: JSONContent) {
    if (node.content?.length) {
      for (const ch of node.content) visit(ch);

      node.content = node.content
        .filter((ch) => {
          if (ch.type !== "text") return true;
          const marks = ch.marks ?? [];
          return !marks.some(
            (m) =>
              m.type === suggestionDeleteMarkName &&
              (m.attrs as { id?: string } | undefined)?.id === markId
          );
        })
        .map((ch) => {
          if (ch.type !== "text" || !ch.marks?.length) return ch;
          const nextMarks = ch.marks.filter(
            (m) =>
              !(
                m.type === suggestionInsertMarkName &&
                (m.attrs as { id?: string } | undefined)?.id === markId
              )
          );
          const out: JSONContent = { ...ch };
          if (nextMarks.length > 0) out.marks = nextMarks;
          else delete out.marks;
          return out;
        });
    }
  }

  visit(cloned);
  return finalizeNarrativeDocAfterSuggestion(cloned);
}

export function stripSuggestionMarksById(doc: JSONContent, markId: string): JSONContent {
  const cloned: JSONContent = JSON.parse(JSON.stringify(doc));

  function visit(node: JSONContent) {
    if (node.content?.length) {
      for (const ch of node.content) visit(ch);

      node.content = node.content.filter((ch) => {
        if (ch.type !== "text") return true;
        const marks = ch.marks ?? [];
        return !marks.some(
          (m) =>
            m.type === suggestionInsertMarkName &&
            (m.attrs as { id?: string } | undefined)?.id === markId
        );
      });

      for (const ch of node.content) {
        if (ch.type !== "text" || !ch.marks?.length) continue;
        ch.marks = ch.marks.filter(
          (m) =>
            !(
              m.type === suggestionDeleteMarkName &&
              (m.attrs as { id?: string } | undefined)?.id === markId
            )
        );
        if (ch.marks.length === 0) delete ch.marks;
      }
    }
  }

  visit(cloned);
  return cloned;
}

/** Locate suggestion marks in plain text for validation before apply. */
export function canLocateEditInPlainText(
  plainText: string,
  edit: SuggestionEdit
): { ok: true } | { ok: false; reason: "not_found" | "ambiguous" } {
  const { anchorText, deleteText, insertText } = edit;
  if (!deleteText.trim() && !insertText.trim()) return { ok: false, reason: "not_found" };

  if (!deleteText.trim() && insertText.trim()) {
    if (!anchorText.trim()) return { ok: true };
    const m = findAnchorInText(plainText, anchorText);
    return m ? { ok: true } : { ok: false, reason: "not_found" };
  }

  if (anchorText.trim()) {
    const anchorCount = countOccurrences(plainText, anchorText);
    if (anchorCount === 0) return { ok: false, reason: "not_found" };
    if (anchorCount > 1) return { ok: false, reason: "ambiguous" };

    const anchorMatch = findAnchorInText(plainText, anchorText);
    if (!anchorMatch) return { ok: false, reason: "not_found" };
    const scopedText = plainText.slice(anchorMatch.start, anchorMatch.end);
    const scopedNeedle = deleteText.trim() || anchorText.trim();
    const scopedCount = countOccurrences(scopedText, scopedNeedle);
    if (scopedCount === 0) return { ok: false, reason: "not_found" };
    if (scopedCount > 1) return { ok: false, reason: "ambiguous" };
    return { ok: true };
  }

  const needle = deleteText.trim() || anchorText.trim();
  const collapsedHay = collapseWhitespace(plainText);
  const collapsedNeedle = collapseWhitespace(needle);
  if (!collapsedNeedle) return { ok: false, reason: "not_found" };

  let count = 0;
  let idx = 0;
  while (true) {
    const found = collapsedHay.indexOf(collapsedNeedle, idx);
    if (found === -1) break;
    count++;
    idx = found + 1;
  }
  if (count === 0) return { ok: false, reason: "not_found" };
  if (count > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true };
}
