import type { JSONContent } from "@tiptap/core";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import {
  collapseWhitespace,
  normalizeUnicodeForAnchor,
} from "@/lib/text/normalize-for-anchor";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
  type SuggestionKind,
  type SuggestionStatus,
} from "@/lib/tiptap/suggestion-marks";
import { finalizeNarrativeDocAfterSuggestion } from "@/lib/tiptap/finalize-narrative-doc";

/**
 * Single source of truth for suggestion anchor matching and apply.
 *
 * Canonical string policy (stated once, here, and nowhere else):
 *  - each text node contributes its characters verbatim;
 *  - a single "\n" between block-level siblings;
 *  - a single " " for each inline atom (image, equation);
 *  - NO markdown pipes, NO list numbers, NO "[equation]" / "[image]" tokens.
 */

export type SuggestionEdit = {
  anchorText: string;
  deleteText: string;
  insertText: string;
};

export type TextSlice = {
  node: JSONContent;
  parentArr: JSONContent[];
  indexInParent: number;
  localStart: number;
  localEnd: number;
  blockId: number;
  cellId: number | null;
  flatStart: number;
  flatEnd: number;
};

export type AnchorIndex = {
  text: string;
  resolveRange(start: number, end: number): TextSlice[];
};

export type LocateStatus =
  | "located"
  | "append"
  | "not_found"
  | "ambiguous"
  | "cross_cell"
  | "empty_edit";

export type LocateResult =
  | {
      status: "located";
      anchorStart: number;
      anchorEnd: number;
      deleteStart: number;
      deleteEnd: number;
    }
  | { status: "append" }
  | { status: Exclude<LocateStatus, "located" | "append"> };

export type InjectAttrs = {
  id: string;
  authorId: string;
  status: SuggestionStatus;
  createdAt: string;
  kind: SuggestionKind;
};

/** Containers whose children are separated by a newline in the canonical string. */
const BLOCK_SEPARATOR_TYPES = new Set([
  "doc",
  "blockquote",
  "listItem",
  "bulletList",
  "orderedList",
  "table",
  "tableRow",
  "codeBlock",
]);

const INLINE_ATOM_TYPES = new Set(["imageInline", "mathInline", "mathBlock"]);

/**
 * Build an exact collapsed-whitespace → raw-index map.
 * Each entry maps a character in the collapsed string to its index in `raw`.
 */
export function buildCollapsedToRawMap(raw: string): {
  collapsed: string;
  collapsedToRaw: number[];
} {
  const collapsedToRaw: number[] = [];
  let collapsed = "";
  let inSpace = true;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (/\s/.test(ch)) {
      if (!inSpace) {
        collapsed += " ";
        collapsedToRaw.push(i);
        inSpace = true;
      }
    } else {
      collapsed += ch;
      collapsedToRaw.push(i);
      inSpace = false;
    }
  }
  while (collapsed.endsWith(" ")) {
    collapsed = collapsed.slice(0, -1);
    collapsedToRaw.pop();
  }
  return { collapsed, collapsedToRaw };
}

export function mapCollapsedRangeToRaw(
  collapsedToRaw: number[],
  collapsedStart: number,
  collapsedLen: number
): { start: number; end: number } | null {
  if (collapsedLen <= 0) return null;
  if (
    collapsedStart < 0 ||
    collapsedStart + collapsedLen > collapsedToRaw.length
  ) {
    return null;
  }
  const start = collapsedToRaw[collapsedStart]!;
  const endExclusive =
    collapsedToRaw[collapsedStart + collapsedLen - 1]! + 1;
  return { start, end: endExclusive };
}

type AnchorMatch = {
  start: number;
  end: number;
  layer: "exact" | "collapsed" | "normalized";
};

function countInString(hay: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    const found = hay.indexOf(needle, idx);
    if (found === -1) break;
    count++;
    idx = found + 1;
  }
  return count;
}

function countCollapsedOccurrences(haystack: string, needle: string): number {
  const collapsedHay = collapseWhitespace(haystack);
  const collapsedNeedle = collapseWhitespace(needle.trim());
  return countInString(collapsedHay, collapsedNeedle);
}

/**
 * Map a unicode-normalized needle onto the original string via an exact
 * character-index map (never a regex re-search).
 */
function mapNormalizedMatchToRaw(
  original: string,
  normNeedle: string
): { start: number; end: number } | null {
  if (!normNeedle) return null;

  const normToRaw: number[] = [];
  let norm = "";
  let inSpace = true;
  for (let i = 0; i < original.length; i++) {
    let ch = original[i]!.normalize("NFC");
    if (ch === "\u00a0") ch = " ";
    if (/[\u2018\u2019\u201a\u201b]/.test(ch)) ch = "'";
    if (/[\u201c\u201d\u201e\u201f]/.test(ch)) ch = '"';
    if (/[\u2013\u2014]/.test(ch)) ch = "-";
    if (ch === "\u2026") {
      for (let k = 0; k < 3; k++) {
        norm += ".";
        normToRaw.push(i);
      }
      inSpace = false;
      continue;
    }
    if (/\s/.test(ch)) {
      if (!inSpace) {
        norm += " ";
        normToRaw.push(i);
        inSpace = true;
      }
    } else {
      norm += ch;
      normToRaw.push(i);
      inSpace = false;
    }
  }
  while (norm.endsWith(" ")) {
    norm = norm.slice(0, -1);
    normToRaw.pop();
  }

  const idx = norm.indexOf(normNeedle);
  if (idx === -1) return null;
  if (countInString(norm, normNeedle) !== 1) return null;
  if (idx + normNeedle.length > normToRaw.length) return null;
  return {
    start: normToRaw[idx]!,
    end: normToRaw[idx + normNeedle.length - 1]! + 1,
  };
}

/**
 * Find `needle` uniquely in `haystack` (exact → collapsed → unicode).
 * Returns exact [start,end) in the original string via the index map.
 * Returns null when not found OR ambiguous (caller may distinguish via
 * countCollapsedOccurrences).
 */
function findUniqueAnchorInText(
  haystack: string,
  needle: string
): AnchorMatch | null {
  const trimmed = needle.trim();
  if (!trimmed) return null;

  if (countCollapsedOccurrences(haystack, trimmed) !== 1) return null;

  const exactIdx = haystack.indexOf(trimmed);
  if (exactIdx !== -1) {
    return {
      layer: "exact",
      start: exactIdx,
      end: exactIdx + trimmed.length,
    };
  }

  const { collapsed, collapsedToRaw } = buildCollapsedToRawMap(haystack);
  const collapsedNeedle = collapseWhitespace(trimmed);
  if (!collapsedNeedle) return null;

  const first = collapsed.indexOf(collapsedNeedle);
  if (first !== -1) {
    const mapped = mapCollapsedRangeToRaw(
      collapsedToRaw,
      first,
      collapsedNeedle.length
    );
    if (!mapped) return null;
    return { layer: "collapsed", ...mapped };
  }

  const normNeedle = normalizeUnicodeForAnchor(trimmed);
  const mapped = mapNormalizedMatchToRaw(haystack, normNeedle);
  if (!mapped) return null;
  return { layer: "normalized", ...mapped };
}

export function flattenForAnchor(doc: JSONContent): AnchorIndex {
  const refs: TextSlice[] = [];
  let flat = "";
  let nextBlockId = 0;
  let nextCellId = 0;

  function visit(
    node: JSONContent,
    parentArr: JSONContent[] | null,
    idx: number,
    blockId: number,
    cellId: number | null
  ) {
    if (node.type === "hardBreak") {
      flat += "\n";
      return;
    }

    if (node.type === "text") {
      const text = node.text ?? "";
      const start = flat.length;
      flat += text;
      if (parentArr) {
        refs.push({
          node,
          parentArr,
          indexInParent: idx,
          localStart: 0,
          localEnd: text.length,
          blockId,
          cellId,
          flatStart: start,
          flatEnd: start + text.length,
        });
      }
      return;
    }

    if (INLINE_ATOM_TYPES.has(node.type ?? "")) {
      flat += " ";
      return;
    }

    if (!node.content?.length) return;

    let childBlockId = blockId;
    let childCellId = cellId;
    if (
      node.type === "paragraph" ||
      node.type === "heading" ||
      node.type === "codeBlock" ||
      node.type === "listItem"
    ) {
      childBlockId = nextBlockId++;
    }
    if (node.type === "tableCell" || node.type === "tableHeader") {
      childCellId = nextCellId++;
      childBlockId = nextBlockId++;
    }

    const arr = node.content;
    const separatesWithNewline = BLOCK_SEPARATOR_TYPES.has(node.type ?? "");

    for (let i = 0; i < arr.length; i++) {
      visit(arr[i]!, arr, i, childBlockId, childCellId);
      if (i < arr.length - 1 && separatesWithNewline) {
        flat += "\n";
      }
    }
  }

  visit(doc, null, 0, 0, null);

  return {
    text: flat,
    resolveRange(start: number, end: number): TextSlice[] {
      if (start < 0 || end < start) return [];

      if (start === end) {
        let best: TextSlice | null = null;
        for (const r of refs) {
          if (r.flatStart <= start && start <= r.flatEnd) {
            const local = start - r.flatStart;
            return [{ ...r, localStart: local, localEnd: local }];
          }
          if (r.flatEnd <= start) best = r;
        }
        if (best) {
          const local = best.flatEnd - best.flatStart;
          return [{ ...best, localStart: local, localEnd: local }];
        }
        return [];
      }

      const out: TextSlice[] = [];
      for (const r of refs) {
        if (r.flatEnd <= start || r.flatStart >= end) continue;
        const localStart = Math.max(0, start - r.flatStart);
        const localEnd = Math.min(
          r.flatEnd - r.flatStart,
          end - r.flatStart
        );
        if (localStart >= localEnd) continue;
        out.push({ ...r, localStart, localEnd });
      }
      return out;
    },
  };
}

export function locateEdit(text: string, edit: SuggestionEdit): LocateResult {
  const anchorText = (edit.anchorText ?? "").trim();
  const deleteText = (edit.deleteText ?? "").trim();
  const insertText = normalizeSuggestionInsertText(edit.insertText ?? "");

  if (!deleteText && !insertText) {
    return { status: "empty_edit" };
  }

  if (!deleteText && insertText) {
    if (!anchorText) return { status: "append" };
    const match = findUniqueAnchorInText(text, anchorText);
    if (!match) {
      if (countCollapsedOccurrences(text, anchorText) > 1) {
        return { status: "ambiguous" };
      }
      return { status: "not_found" };
    }
    return {
      status: "located",
      anchorStart: match.start,
      anchorEnd: match.end,
      deleteStart: match.end,
      deleteEnd: match.end,
    };
  }

  if (anchorText) {
    const anchorMatch = findUniqueAnchorInText(text, anchorText);
    if (!anchorMatch) {
      if (countCollapsedOccurrences(text, anchorText) > 1) {
        return { status: "ambiguous" };
      }
    } else {
      const scoped = text.slice(anchorMatch.start, anchorMatch.end);
      const innerNeedle = deleteText || anchorText;
      const inner = findUniqueAnchorInText(scoped, innerNeedle);
      if (inner) {
        return {
          status: "located",
          anchorStart: anchorMatch.start,
          anchorEnd: anchorMatch.end,
          deleteStart: anchorMatch.start + inner.start,
          deleteEnd: anchorMatch.start + inner.end,
        };
      }
    }
  }

  const delMatch = findUniqueAnchorInText(text, deleteText);
  if (!delMatch) {
    if (countCollapsedOccurrences(text, deleteText) > 1) {
      return { status: "ambiguous" };
    }
    return { status: "not_found" };
  }

  return {
    status: "located",
    anchorStart: delMatch.start,
    anchorEnd: delMatch.end,
    deleteStart: delMatch.start,
    deleteEnd: delMatch.end,
  };
}

function withLeadingSpaceIfNeeded(
  haystack: string,
  insertAt: number,
  insert: string
): string {
  if (!insert || /^\s/.test(insert)) return insert;
  if (insertAt <= 0) return insert;
  const before = haystack[insertAt - 1];
  return before !== undefined && !/\s/.test(before) ? ` ${insert}` : insert;
}

export function applyEditToPlainText(
  text: string,
  edit: SuggestionEdit
): { status: LocateStatus; text: string } {
  const located = locateEdit(text, edit);
  if (located.status === "append") {
    const ins = normalizeSuggestionInsertText(edit.insertText ?? "");
    if (!ins) return { status: "empty_edit", text };
    const next =
      text + (text.length > 0 && !/\s$/.test(text) ? " " : "") + ins;
    return { status: "append", text: next };
  }
  if (located.status !== "located") {
    return { status: located.status, text };
  }

  const ins = normalizeSuggestionInsertText(edit.insertText ?? "");
  const insert = withLeadingSpaceIfNeeded(text, located.deleteStart, ins);
  const next =
    text.slice(0, located.deleteStart) +
    insert +
    text.slice(located.deleteEnd);
  return { status: "located", text: next };
}

export function probePlainEdit(
  text: string,
  edit: SuggestionEdit
): LocateStatus {
  return locateEdit(text, edit).status;
}

function splitTextNodeForDelete(
  ref: TextSlice,
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

/**
 * Split a text node at `localOffset` so we can insert after the left half.
 * Returns a TextSlice pointing at the left half (insertion goes after it).
 */
function splitTextNodeAt(
  ref: TextSlice,
  localOffset: number
): TextSlice {
  const original = ref.node.text ?? "";
  if (localOffset <= 0) {
    // Insert before this node — return a synthetic "before" by shifting index.
    return {
      ...ref,
      indexInParent: ref.indexInParent - 1,
      localStart: 0,
      localEnd: 0,
    };
  }
  if (localOffset >= original.length) {
    return ref;
  }
  const before = original.slice(0, localOffset);
  const after = original.slice(localOffset);
  const baseMarks = ref.node.marks ?? [];
  const left: JSONContent = {
    type: "text",
    text: before,
    marks: baseMarks.length ? baseMarks : undefined,
  };
  const right: JSONContent = {
    type: "text",
    text: after,
    marks: baseMarks.length ? baseMarks : undefined,
  };
  ref.parentArr.splice(ref.indexInParent, 1, left, right);
  return {
    ...ref,
    node: left,
    localStart: 0,
    localEnd: before.length,
  };
}

function cleanupMarks(node: JSONContent) {
  if (node.marks?.length === 0) delete node.marks;
  if (node.content?.length) for (const ch of node.content) cleanupMarks(ch);
}

function insertAfterRef(
  cloned: JSONContent,
  insertAfter: TextSlice | null,
  insertText: string,
  attrs: InjectAttrs
): JSONContent | null {
  const trimmed = normalizeSuggestionInsertText(insertText);
  if (!trimmed) return null;

  // Rich inserts keep the model's spacing verbatim (prompt asks for a leading
  // space on mid-sentence inserts). Do NOT auto-prefix a space here.
  const insertMark = {
    type: suggestionInsertMarkName,
    attrs: { ...attrs },
  };
  const insertedNode: JSONContent = {
    type: "text",
    text: trimmed,
    marks: [insertMark],
  };

  if (insertAfter && insertAfter.indexInParent >= 0) {
    insertAfter.parentArr.splice(
      insertAfter.indexInParent + 1,
      0,
      insertedNode
    );
  } else if (insertAfter && insertAfter.indexInParent < 0) {
    insertAfter.parentArr.splice(0, 0, insertedNode);
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

function checkCrossCell(
  index: AnchorIndex,
  start: number,
  end: number
): boolean {
  if (start === end) return false;
  const slices = index.resolveRange(start, end);
  if (slices.length === 0) return false;
  const cellIds = new Set(
    slices.map((s) => s.cellId).filter((id): id is number => id !== null)
  );
  return cellIds.size > 1;
}

function findLastDeleteMarked(
  node: JSONContent,
  markId: string,
  parentArr: JSONContent[] | null,
  idx: number
): TextSlice | null {
  let found: TextSlice | null = null;
  if (node.type === "text" && node.marks?.length && parentArr) {
    const has = node.marks.some(
      (m) =>
        m.type === suggestionDeleteMarkName &&
        (m.attrs as { id?: string } | undefined)?.id === markId
    );
    if (has) {
      found = {
        node,
        parentArr,
        indexInParent: idx,
        localStart: 0,
        localEnd: (node.text ?? "").length,
        blockId: 0,
        cellId: null,
        flatStart: 0,
        flatEnd: 0,
      };
    }
  }
  if (node.content?.length) {
    for (let i = 0; i < node.content.length; i++) {
      const child = findLastDeleteMarked(
        node.content[i]!,
        markId,
        node.content,
        i
      );
      if (child) found = child;
    }
  }
  return found;
}

export function applyEditToRichDoc(
  doc: JSONContent,
  edit: SuggestionEdit,
  attrs: InjectAttrs
): { status: LocateStatus; doc: JSONContent } {
  const index = flattenForAnchor(doc);
  const located = locateEdit(index.text, edit);

  if (located.status === "append") {
    const cloned: JSONContent = JSON.parse(JSON.stringify(doc));
    const inserted = insertAfterRef(
      cloned,
      null,
      edit.insertText ?? "",
      attrs
    );
    if (!inserted) return { status: "empty_edit", doc: cloned };
    cleanupMarks(cloned);
    return { status: "append", doc: cloned };
  }

  if (located.status !== "located") {
    return { status: located.status, doc };
  }

  if (checkCrossCell(index, located.deleteStart, located.deleteEnd)) {
    return { status: "cross_cell", doc };
  }

  const cloned: JSONContent = JSON.parse(JSON.stringify(doc));
  const freshIndex = flattenForAnchor(cloned);
  const reLocated = locateEdit(freshIndex.text, edit);
  if (reLocated.status !== "located") {
    return { status: reLocated.status, doc: cloned };
  }

  const { deleteStart, deleteEnd, anchorStart, anchorEnd } = reLocated;
  const insertText = normalizeSuggestionInsertText(edit.insertText ?? "");
  let insertAfter: TextSlice | null = null;

  if (deleteStart < deleteEnd) {
    const affected = freshIndex.resolveRange(deleteStart, deleteEnd);
    // Group by parent and process high indices first so splices stay valid.
    const byParent = new Map<JSONContent[], TextSlice[]>();
    for (const s of affected) {
      const list = byParent.get(s.parentArr) ?? [];
      list.push(s);
      byParent.set(s.parentArr, list);
    }
    for (const [, slices] of byParent) {
      slices.sort((a, b) => b.indexInParent - a.indexInParent);
      // Within one text node, only one slice — but after earlier splices in
      // other parents we're fine. Same parent, process high→low.
      for (const s of slices) {
        // Re-find current indexInParent after prior splices in this parent:
        const currentIdx = s.parentArr.indexOf(s.node);
        if (currentIdx < 0) continue;
        splitTextNodeForDelete(
          { ...s, indexInParent: currentIdx },
          s.localStart,
          s.localEnd,
          attrs
        );
      }
    }
    insertAfter = findLastDeleteMarked(cloned, attrs.id, null, 0);
  } else {
    // Pure insert: split at anchorEnd so we insert immediately after the anchor.
    const at = freshIndex.resolveRange(anchorEnd, anchorEnd);
    if (at[0]) {
      const ref = at[0];
      const currentIdx = ref.parentArr.indexOf(ref.node);
      if (currentIdx >= 0) {
        insertAfter = splitTextNodeAt(
          { ...ref, indexInParent: currentIdx },
          ref.localStart
        );
      }
    } else {
      // Anchor was empty-ish; try range of whole anchor
      const affected = freshIndex.resolveRange(anchorStart, anchorEnd);
      const last = affected[affected.length - 1];
      if (last) {
        const currentIdx = last.parentArr.indexOf(last.node);
        if (currentIdx >= 0) {
          insertAfter = splitTextNodeAt(
            { ...last, indexInParent: currentIdx },
            last.localEnd
          );
        }
      }
    }
  }

  if (insertText) {
    insertAfterRef(cloned, insertAfter, insertText, attrs);
  }

  cleanupMarks(cloned);
  return { status: "located", doc: cloned };
}

export function probeRichEdit(
  doc: JSONContent,
  edit: SuggestionEdit
): LocateStatus {
  const index = flattenForAnchor(doc);
  const located = locateEdit(index.text, edit);
  if (located.status === "located") {
    if (checkCrossCell(index, located.deleteStart, located.deleteEnd)) {
      return "cross_cell";
    }
  }
  return located.status;
}

export function isApplyableStatus(status: LocateStatus): boolean {
  return status === "located" || status === "append";
}

function hasMarkWithId(
  node: JSONContent,
  markName: string,
  markId: string
): boolean {
  if (node.type === "text") {
    return (node.marks ?? []).some(
      (m) =>
        m.type === markName &&
        (m.attrs as { id?: string } | undefined)?.id === markId
    );
  }
  return (node.content ?? []).some((ch) => hasMarkWithId(ch, markName, markId));
}

function blockHasTextOutsideMark(
  node: JSONContent,
  markName: string,
  markId: string
): boolean {
  if (node.type === "text") {
    if ((node.text ?? "").length === 0) return false;
    return !(node.marks ?? []).some(
      (m) =>
        m.type === markName &&
        (m.attrs as { id?: string } | undefined)?.id === markId
    );
  }
  return (node.content ?? []).some((ch) =>
    blockHasTextOutsideMark(ch, markName, markId)
  );
}

function dropBlocksFullyMarked(
  doc: JSONContent,
  markName: string,
  markId: string
): void {
  if (!doc.content?.length) return;
  doc.content = doc.content.filter(
    (block) =>
      !(
        hasMarkWithId(block, markName, markId) &&
        !blockHasTextOutsideMark(block, markName, markId)
      )
  );
}

function dropEmptyBlocks(doc: JSONContent): void {
  if (!doc.content?.length) return;
  doc.content = doc.content.filter((block) => {
    if (block.type === "paragraph" || block.type === "heading") {
      const text = (block.content ?? [])
        .map((c) => (c.type === "text" ? c.text ?? "" : ""))
        .join("");
      const hasNonText = (block.content ?? []).some(
        (c) => c.type !== "text" && c.type !== "hardBreak"
      );
      return hasNonText || text.length > 0;
    }
    return true;
  });
  if (doc.content.length === 0) {
    doc.content = [{ type: "paragraph" }];
  }
}

export function acceptSuggestionMarksById(
  doc: JSONContent,
  markId: string
): JSONContent {
  const cloned: JSONContent = JSON.parse(JSON.stringify(doc));
  dropBlocksFullyMarked(cloned, suggestionDeleteMarkName, markId);

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
  dropEmptyBlocks(cloned);
  return finalizeNarrativeDocAfterSuggestion(cloned);
}

export function stripSuggestionMarksById(
  doc: JSONContent,
  markId: string
): JSONContent {
  const cloned: JSONContent = JSON.parse(JSON.stringify(doc));
  dropBlocksFullyMarked(cloned, suggestionInsertMarkName, markId);

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

/** Apply marks then accept — final content with no pending marks. */
export function applyAndAcceptRichEdit(
  doc: JSONContent,
  suggestionId: string,
  edit: SuggestionEdit,
  attrs?: Partial<InjectAttrs>
): { status: LocateStatus; doc: JSONContent } {
  const fullAttrs: InjectAttrs = {
    id: suggestionId,
    authorId: attrs?.authorId ?? "ai",
    status: "pending",
    createdAt: attrs?.createdAt ?? new Date().toISOString(),
    kind: attrs?.kind ?? "fix",
  };
  const applied = applyEditToRichDoc(doc, edit, fullAttrs);
  if (applied.status !== "located" && applied.status !== "append") {
    return applied;
  }
  return {
    status: applied.status,
    doc: acceptSuggestionMarksById(applied.doc, suggestionId),
  };
}
