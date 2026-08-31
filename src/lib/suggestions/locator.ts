import type { JSONContent } from "@tiptap/core";
import {
  isCitationAppendInsert,
  isCitationListHeading,
  isEmptyParagraphBlock,
  keepEmptyParagraphBeforeCitationHeading,
  normalizeCitationAppendInsert,
  normalizeTrailingCitationBlockInText,
  plainCitationAppendSeparator,
} from "@/lib/suggestions/citations-at-end";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import {
  inlineMarkdownToTextNodes,
  stripInlineMarkdown,
} from "@/lib/tiptap/markdown-to-doc";
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
import {
  classifyMarkdownInsert,
  insertMarkdownBlocks,
} from "@/lib/suggestions/insert-markdown";
import {
  bodyAppendIndex,
  spliceTopLevelNodes,
  topLevelIndexContainingNode,
  type PairedBlockKind,
} from "@/lib/suggestions/block-insert";
import {
  acceptPendingImageSuggestions,
  dropPendingImageSuggestions,
  insertPendingImageAfterDeletionMark,
  locateImageRemoval,
  markImageForDeletion,
  pendingImageInlineNode,
  type SuggestionImageInsert,
  type SuggestionImageRemove,
} from "@/lib/suggestions/image-insert";

/**
 * Single source of truth for suggestion anchor matching and apply.
 *
 * Canonical string policy (stated once, here, and nowhere else):
 *  - each text node contributes its characters verbatim;
 *  - a single "\n" between block-level siblings;
 *  - a single " " for each inline atom (image, equation);
 *  - NO markdown pipes, NO list numbers, NO "[equation]" / "[image]" tokens.
 */

/**
 * Structural scope for an edit. When present, matching and apply are confined
 * to a single table cell (by row/col) or list item (by index), so short or
 * repeated values resolve uniquely and cross-cell spans are impossible.
 * `tableIndex` / `listIndex` default to 0 (the first table / list in the field).
 */
export type EditScope =
  | { kind: "cell"; tableIndex?: number; row: number; col: number }
  | { kind: "listItem"; listIndex?: number; index: number };

export type SuggestionEdit = {
  anchorText: string;
  deleteText: string;
  insertText: string;
  /** Inline figure to insert after the located site (rich fields only). */
  insertImage?: SuggestionImageInsert;
  /** Existing inline figure to mark for deletion (rich fields only). */
  removeImage?: SuggestionImageRemove;
  scope?: EditScope;
  /**
   * Optional second apply site in the same field (e.g. a citation appended
   * at the end while the primary part edits the claim or a table cell).
   */
  second?: Omit<SuggestionEdit, "second">;
  /**
   * Empty-anchor append: insert immediately before the last table/image in
   * the field body (used when a same-turn lead-in follows a committed block).
   */
  placeBeforePairedBlock?: "table" | "image";
};

/** Same-field reposition: remove original and insert after a quoted span. */
export function isPositionedImageMove(
  edit: Pick<SuggestionEdit, "anchorText" | "insertImage" | "removeImage">
): boolean {
  return Boolean(
    edit.removeImage && edit.insertImage && (edit.anchorText ?? "").trim()
  );
}

function hasEditContent(
  edit: Pick<
    SuggestionEdit,
    "deleteText" | "insertText" | "insertImage" | "removeImage"
  >
): boolean {
  return Boolean(
    (edit.deleteText ?? "").trim() ||
      (edit.insertText ?? "").trim() ||
      edit.insertImage ||
      edit.removeImage
  );
}

/** Primary (and optional second) parts; empty primary is omitted when second exists. */
export function suggestionEditParts(edit: SuggestionEdit): SuggestionEdit[] {
  const primary: SuggestionEdit = {
    anchorText: edit.anchorText,
    deleteText: edit.deleteText,
    insertText: edit.insertText,
    insertImage: edit.insertImage,
    removeImage: edit.removeImage,
    scope: edit.scope,
    placeBeforePairedBlock: edit.placeBeforePairedBlock,
  };
  const second = edit.second;
  const parts: SuggestionEdit[] = [];
  if (hasEditContent(primary)) parts.push(primary);
  if (second && hasEditContent(second)) {
    parts.push({
      anchorText: second.anchorText,
      deleteText: second.deleteText,
      insertText: second.insertText,
      insertImage: second.insertImage,
      scope: second.scope,
    });
  }
  return parts.length > 0 ? parts : [primary];
}

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

/** A resolved table cell: its position, node, and flat-string span. */
export type CellRef = {
  tableIndex: number;
  row: number;
  col: number;
  cellId: number;
  node: JSONContent;
  flatStart: number;
  flatEnd: number;
};

/** A resolved list item: its list ordinal, index, node, and flat-string span. */
export type ListItemRef = {
  listIndex: number;
  index: number;
  node: JSONContent;
  flatStart: number;
  flatEnd: number;
};

export type AnchorIndex = {
  text: string;
  resolveRange(start: number, end: number): TextSlice[];
  cells: CellRef[];
  listItems: ListItemRef[];
};

export type LocateStatus =
  | "located"
  | "append"
  | "not_found"
  | "ambiguous"
  | "cross_cell"
  | "bad_scope"
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
  /** Per-operation index. `id` stays the comment id (data-eval-id). */
  opIndex?: number | null;
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
  const cells: CellRef[] = [];
  const listItems: ListItemRef[] = [];
  let flat = "";
  let nextBlockId = 0;
  let nextCellId = 0;
  let nextTableIndex = 0;
  let nextListIndex = 0;

  function visit(
    node: JSONContent,
    parentArr: JSONContent[] | null,
    idx: number,
    blockId: number,
    cellId: number | null,
    // Structural position, threaded down from the nearest ancestor table/list.
    tableIndex: number,
    rowIndex: number,
    colIndex: number,
    listIndex: number,
    itemIndex: number
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

    if (!node.content?.length) {
      // Empty table cells / list items still need a resolvable (zero-width)
      // span so scoped edits can target and insert into them.
      const at = flat.length;
      if (node.type === "tableCell" || node.type === "tableHeader") {
        cells.push({
          tableIndex,
          row: rowIndex,
          col: colIndex,
          cellId: nextCellId++,
          node,
          flatStart: at,
          flatEnd: at,
        });
      } else if (node.type === "listItem") {
        listItems.push({
          listIndex,
          index: itemIndex,
          node,
          flatStart: at,
          flatEnd: at,
        });
      }
      return;
    }

    let childBlockId = blockId;
    let childCellId = cellId;
    let childTableIndex = tableIndex;
    let childListIndex = listIndex;
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
    if (node.type === "table") {
      childTableIndex = nextTableIndex++;
    }
    if (node.type === "bulletList" || node.type === "orderedList") {
      childListIndex = nextListIndex++;
    }

    const arr = node.content;
    const separatesWithNewline = BLOCK_SEPARATOR_TYPES.has(node.type ?? "");
    const containerFlatStart = flat.length;

    for (let i = 0; i < arr.length; i++) {
      // A table's children are rows; a row's children are cells; a list's
      // children are items. Pass the child's structural index accordingly.
      const childRowIndex = node.type === "table" ? i : rowIndex;
      const childColIndex = node.type === "tableRow" ? i : colIndex;
      const childItemIndex =
        node.type === "bulletList" || node.type === "orderedList"
          ? i
          : itemIndex;
      visit(
        arr[i]!,
        arr,
        i,
        childBlockId,
        childCellId,
        childTableIndex,
        childRowIndex,
        childColIndex,
        childListIndex,
        childItemIndex
      );
      if (i < arr.length - 1 && separatesWithNewline) {
        flat += "\n";
      }
    }

    if (node.type === "tableCell" || node.type === "tableHeader") {
      cells.push({
        tableIndex,
        row: rowIndex,
        col: colIndex,
        cellId: childCellId!,
        node,
        flatStart: containerFlatStart,
        flatEnd: flat.length,
      });
    } else if (node.type === "listItem") {
      listItems.push({
        listIndex,
        index: itemIndex,
        node,
        flatStart: containerFlatStart,
        flatEnd: flat.length,
      });
    }
  }

  visit(doc, null, 0, 0, null, -1, -1, -1, -1, -1);

  return {
    text: flat,
    cells,
    listItems,
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

/** Resolve a structural scope to its flat-string window and container node. */
export function resolveScopeWindow(
  index: AnchorIndex,
  scope: EditScope
): { start: number; end: number; node: JSONContent } | null {
  if (scope.kind === "cell") {
    const tableIndex = scope.tableIndex ?? 0;
    const cell = index.cells.find(
      (c) =>
        c.tableIndex === tableIndex &&
        c.row === scope.row &&
        c.col === scope.col
    );
    if (!cell) return null;
    return { start: cell.flatStart, end: cell.flatEnd, node: cell.node };
  }
  const listIndex = scope.listIndex ?? 0;
  const item = index.listItems.find(
    (l) => l.listIndex === listIndex && l.index === scope.index
  );
  if (!item) return null;
  return { start: item.flatStart, end: item.flatEnd, node: item.node };
}

/**
 * Locate an edit, honoring `edit.scope`. A scoped edit matches only within its
 * target cell / list-item window and returns offsets in absolute flat coords,
 * so short or repeated values resolve uniquely and cross-cell spans cannot
 * form. With no scope this is exactly `locateEdit`.
 */
export function locateScopedEdit(
  index: AnchorIndex,
  edit: SuggestionEdit
): LocateResult {
  if (!edit.scope) return locateEdit(index.text, edit);

  const win = resolveScopeWindow(index, edit.scope);
  if (!win) return { status: "bad_scope" };

  const anchor = (edit.anchorText ?? "").trim();
  const del = (edit.deleteText ?? "").trim();
  const insert = normalizeSuggestionInsertText(edit.insertText ?? "");

  if (!del && !insert) return { status: "empty_edit" };

  // No anchor and no delete text → set the whole container to insertText
  // (the common "set this cell / list item to X" operation).
  if (!anchor && !del) {
    return {
      status: "located",
      anchorStart: win.start,
      anchorEnd: win.end,
      deleteStart: win.start,
      deleteEnd: win.end,
    };
  }

  const windowText = index.text.slice(win.start, win.end);
  const inner = locateEdit(windowText, edit);
  if (inner.status !== "located") return inner;
  return {
    status: "located",
    anchorStart: inner.anchorStart + win.start,
    anchorEnd: inner.anchorEnd + win.start,
    deleteStart: inner.deleteStart + win.start,
    deleteEnd: inner.deleteEnd + win.start,
  };
}

export function locateEdit(text: string, edit: SuggestionEdit): LocateResult {
  const anchorText = (edit.anchorText ?? "").trim();
  const deleteText = (edit.deleteText ?? "").trim();
  const insertText = normalizeSuggestionInsertText(edit.insertText ?? "");
  const hasInsert = Boolean(insertText || edit.insertImage);

  if (!deleteText && !hasInsert) {
    return { status: "empty_edit" };
  }

  if (!deleteText && hasInsert) {
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

/**
 * Top-level block index that contains a unique `afterAnchor` span, so a new
 * table/figure can be inserted after that block.
 */
export function topLevelIndexAfterAnchor(
  doc: JSONContent,
  afterAnchor: string
): { status: "ok"; index: number } | { status: "not_found" | "ambiguous" } {
  const index = flattenForAnchor(doc);
  const located = locateEdit(index.text, {
    anchorText: afterAnchor,
    deleteText: "",
    insertText: "x",
  });
  if (located.status === "ambiguous") return { status: "ambiguous" };
  if (located.status !== "located") return { status: "not_found" };
  const slices = index.resolveRange(located.deleteStart, located.deleteStart);
  const node = slices[0]?.node;
  if (!node) return { status: "not_found" };
  return { status: "ok", index: topLevelIndexContainingNode(doc, node) };
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

function plainAppendSeparator(text: string, insert: string): string {
  if (!text) return "";
  if (isCitationAppendInsert(insert)) {
    return plainCitationAppendSeparator(text, insert);
  }
  return /\s$/.test(text) ? "" : " ";
}

function applySingleEditToPlainText(
  text: string,
  edit: SuggestionEdit
): { status: LocateStatus; text: string } {
  const located = locateEdit(text, edit);
  if (located.status === "append") {
    let ins = stripInlineMarkdown(
      normalizeSuggestionInsertText(edit.insertText ?? "")
    );
    if (!ins) return { status: "empty_edit", text };
    if (isCitationAppendInsert(ins)) {
      ins = normalizeCitationAppendInsert(text, ins);
    }
    const next = text + plainAppendSeparator(text, ins) + ins;
    return { status: "append", text: next };
  }
  if (located.status !== "located") {
    return { status: located.status, text };
  }

  const ins = stripInlineMarkdown(
    normalizeSuggestionInsertText(edit.insertText ?? "")
  );
  const insert = withLeadingSpaceIfNeeded(text, located.deleteStart, ins);
  const next =
    text.slice(0, located.deleteStart) +
    insert +
    text.slice(located.deleteEnd);
  return { status: "located", text: next };
}

export function applyEditToPlainText(
  text: string,
  edit: SuggestionEdit
): { status: LocateStatus; text: string } {
  const parts = suggestionEditParts(edit);
  if (parts.length === 1) {
    const result = applySingleEditToPlainText(text, parts[0]!);
    if (!isApplyableStatus(result.status)) return result;
    return {
      status: result.status,
      text: normalizeTrailingCitationBlockInText(result.text),
    };
  }
  let current = text;
  let lastStatus: LocateStatus = "empty_edit";
  for (const part of parts) {
    const result = applySingleEditToPlainText(current, part);
    if (!isApplyableStatus(result.status)) return result;
    current = result.text;
    lastStatus = result.status;
  }
  return {
    status: lastStatus,
    text: normalizeTrailingCitationBlockInText(current),
  };
}

export function probePlainEdit(
  text: string,
  edit: SuggestionEdit
): LocateStatus {
  const parts = suggestionEditParts(edit);
  let sawLocated = false;
  for (const part of parts) {
    const status = locateEdit(text, part).status;
    if (!isApplyableStatus(status)) return status;
    if (status === "located") sawLocated = true;
  }
  return sawLocated ? "located" : "append";
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
  attrs: InjectAttrs,
  appendAt: "body" | "end" = "end",
  beforePaired?: PairedBlockKind
): JSONContent | null {
  const trimmed = normalizeSuggestionInsertText(insertText);
  if (!trimmed) return null;

  // Rich inserts keep the model's spacing verbatim (prompt asks for a leading
  // space on mid-sentence inserts). Do NOT auto-prefix a space here.
  const insertMark = {
    type: suggestionInsertMarkName,
    attrs: { ...attrs },
  };
  const insertedNodes = inlineMarkdownToTextNodes(trimmed, [insertMark]);
  if (insertedNodes.length === 0) return null;
  const insertedNode = insertedNodes[insertedNodes.length - 1]!;

  if (insertAfter && insertAfter.indexInParent >= 0) {
    insertAfter.parentArr.splice(
      insertAfter.indexInParent + 1,
      0,
      ...insertedNodes
    );
  } else if (insertAfter && insertAfter.indexInParent < 0) {
    insertAfter.parentArr.splice(0, 0, ...insertedNodes);
  } else {
    const para: JSONContent = {
      type: "paragraph",
      content: insertedNodes,
    };
    if (cloned.type !== "doc") return insertedNode;
    if (appendAt === "body") {
      spliceTopLevelNodes(
        cloned,
        bodyAppendIndex(cloned, beforePaired),
        [para]
      );
    } else {
      cloned.content = [...(cloned.content ?? []), para];
    }
  }
  return insertedNode;
}

/**
 * Insert an insert-marked text node into an otherwise-empty scoped container
 * (a blank table cell or list item), creating a paragraph if needed.
 */
function insertImageAfterRef(
  cloned: JSONContent,
  insertAfter: TextSlice | null,
  image: SuggestionImageInsert,
  suggestionId: string,
  appendAt: "body" | "end" = "end",
  beforePaired?: PairedBlockKind
): JSONContent {
  const node = pendingImageInlineNode(image, suggestionId);
  if (insertAfter && insertAfter.indexInParent >= 0) {
    insertAfter.parentArr.splice(insertAfter.indexInParent + 1, 0, node);
    return node;
  }
  if (insertAfter && insertAfter.indexInParent < 0) {
    insertAfter.parentArr.splice(0, 0, node);
    return node;
  }
  const para: JSONContent = { type: "paragraph", content: [node] };
  if (cloned.type !== "doc") return node;
  if (appendAt === "body") {
    spliceTopLevelNodes(cloned, bodyAppendIndex(cloned, beforePaired), [para]);
    return node;
  }
  const last = cloned.content?.[cloned.content.length - 1];
  const lastEmpty =
    last?.type === "paragraph" &&
    !(last.content ?? []).some(
      (child) =>
        child.type === "text"
          ? (child.text ?? "").length > 0
          : child.type !== "hardBreak"
    );
  if (lastEmpty && last) {
    last.content = [node];
  } else {
    cloned.content = [...(cloned.content ?? []), para];
  }
  return node;
}

function insertIntoEmptyContainer(
  node: JSONContent,
  insertText: string,
  attrs: InjectAttrs,
  insertImage?: SuggestionImageInsert
): boolean {
  const trimmed = normalizeSuggestionInsertText(insertText);
  const textNodes = trimmed
    ? inlineMarkdownToTextNodes(trimmed, [
        { type: suggestionInsertMarkName, attrs: { ...attrs } },
      ])
    : [];
  const imageNode = insertImage
    ? pendingImageInlineNode(insertImage, attrs.id)
    : null;
  if (textNodes.length === 0 && !imageNode) return false;
  const extra = imageNode ? [imageNode] : [];
  if (!node.content || node.content.length === 0) {
    node.content = [{ type: "paragraph", content: [...textNodes, ...extra] }];
    return true;
  }
  const para = node.content.find((c) => c.type === "paragraph") ?? node.content[0]!;
  para.content = [...(para.content ?? []), ...textNodes, ...extra];
  return true;
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

function applySingleEditToRichDoc(
  doc: JSONContent,
  edit: SuggestionEdit,
  attrs: InjectAttrs
): { status: LocateStatus; doc: JSONContent } {
  if (isPositionedImageMove(edit) && edit.removeImage) {
    const status = locateImageRemoval(doc, edit.removeImage);
    if (status !== "located") return { status, doc };
    const cloned: JSONContent = JSON.parse(JSON.stringify(doc));
    if (!markImageForDeletion(cloned, edit.removeImage, attrs.id)) {
      return { status: "not_found", doc };
    }
    const insertOnly: SuggestionEdit = { ...edit, removeImage: undefined };
    return applySingleEditToRichDoc(cloned, insertOnly, attrs);
  }

  if (edit.removeImage) {
    const status = locateImageRemoval(doc, edit.removeImage);
    if (status !== "located") return { status, doc };
    const cloned: JSONContent = JSON.parse(JSON.stringify(doc));
    if (!markImageForDeletion(cloned, edit.removeImage, attrs.id)) {
      return { status: "not_found", doc };
    }
    if (edit.insertImage) {
      if (!insertPendingImageAfterDeletionMark(cloned, edit.insertImage, attrs.id)) {
        return { status: "not_found", doc };
      }
    }
    cleanupMarks(cloned);
    return { status: "located", doc: cloned };
  }

  const index = flattenForAnchor(doc);
  const located = locateScopedEdit(index, edit);

  if (located.status === "append") {
    const cloned: JSONContent = JSON.parse(JSON.stringify(doc));
    if (edit.insertImage && !normalizeSuggestionInsertText(edit.insertText ?? "")) {
      insertImageAfterRef(
        cloned,
        null,
        edit.insertImage,
        attrs.id,
        "body",
        edit.placeBeforePairedBlock
      );
      cleanupMarks(cloned);
      return { status: "append", doc: cloned };
    }
    let raw = normalizeSuggestionInsertText(edit.insertText ?? "");
    if (isCitationAppendInsert(raw)) {
      raw = normalizeCitationAppendInsert(index.text, raw);
      const paragraphs = raw
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (paragraphs.length === 0 && !edit.insertImage) {
        return { status: "empty_edit", doc: cloned };
      }
      const lastBlock = cloned.content?.[cloned.content.length - 1];
      if (
        paragraphs[0] &&
        isCitationListHeading(paragraphs[0]) &&
        lastBlock &&
        !isEmptyParagraphBlock(lastBlock)
      ) {
        cloned.content = [...(cloned.content ?? []), { type: "paragraph" }];
      }
      let inserted = false;
      for (const paragraph of paragraphs) {
        if (insertAfterRef(cloned, null, paragraph, attrs, "end")) inserted = true;
      }
      if (!inserted && !edit.insertImage) {
        return { status: "empty_edit", doc: cloned };
      }
    } else {
      const classified = classifyMarkdownInsert(raw);
      if (classified.kind === "table") {
        return { status: "not_found", doc };
      }
      if (classified.kind === "empty" && !edit.insertImage) {
        return { status: "empty_edit", doc: cloned };
      }
      if (classified.kind === "blocks") {
        insertMarkdownBlocks(cloned, null, classified.content, attrs, {
          beforePairedBlock: edit.placeBeforePairedBlock,
        });
      } else if (classified.kind === "inline") {
        if (
          !insertAfterRef(
            cloned,
            null,
            classified.text,
            attrs,
            "body",
            edit.placeBeforePairedBlock
          ) &&
          !edit.insertImage
        ) {
          return { status: "empty_edit", doc: cloned };
        }
      }
    }
    if (edit.insertImage) {
      insertImageAfterRef(
        cloned,
        null,
        edit.insertImage,
        attrs.id,
        "body",
        edit.placeBeforePairedBlock
      );
    }
    cleanupMarks(cloned);
    return { status: "append", doc: cloned };
  }

  if (located.status !== "located") {
    return { status: located.status, doc };
  }

  // Scoped edits are confined to one cell/item, so cross-cell cannot occur;
  // the guard only protects un-scoped, whole-field anchoring.
  if (
    !edit.scope &&
    checkCrossCell(index, located.deleteStart, located.deleteEnd)
  ) {
    return { status: "cross_cell", doc };
  }

  const cloned: JSONContent = JSON.parse(JSON.stringify(doc));
  const freshIndex = flattenForAnchor(cloned);
  const reLocated = locateScopedEdit(freshIndex, edit);
  if (reLocated.status !== "located") {
    return { status: reLocated.status, doc: cloned };
  }

  const { deleteStart, deleteEnd, anchorStart, anchorEnd } = reLocated;
  const insertText = normalizeSuggestionInsertText(edit.insertText ?? "");
  let insertAfter: TextSlice | null = null;

  // Blank scoped container (e.g. an empty table cell): there is no text node to
  // split at, so insert directly into the container node.
  if (edit.scope && deleteStart === deleteEnd) {
    const win = resolveScopeWindow(freshIndex, edit.scope);
    if (win && win.start === win.end && deleteStart === win.start) {
      const ok = insertIntoEmptyContainer(
        win.node,
        insertText,
        attrs,
        edit.insertImage
      );
      cleanupMarks(cloned);
      return { status: ok ? "located" : "empty_edit", doc: cloned };
    }
  }

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
    const classified = classifyMarkdownInsert(insertText);
    if (classified.kind === "table") {
      return { status: "not_found", doc };
    }
    if (classified.kind === "blocks") {
      insertMarkdownBlocks(
        cloned,
        insertAfter?.node ?? null,
        classified.content,
        attrs
      );
    } else if (classified.kind === "inline") {
      const inserted = insertAfterRef(cloned, insertAfter, classified.text, attrs);
      if (inserted && insertAfter) {
        const idx = insertAfter.parentArr.indexOf(inserted);
        if (idx >= 0) {
          insertAfter = { ...insertAfter, indexInParent: idx, node: inserted };
        }
      }
    }
  }
  if (edit.insertImage) {
    insertImageAfterRef(cloned, insertAfter, edit.insertImage, attrs.id);
  }

  cleanupMarks(cloned);
  return { status: "located", doc: cloned };
}

export function applyEditToRichDoc(
  doc: JSONContent,
  edit: SuggestionEdit,
  attrs: InjectAttrs
): { status: LocateStatus; doc: JSONContent } {
  const parts = suggestionEditParts(edit);
  if (parts.length === 1) {
    return applySingleEditToRichDoc(doc, parts[0]!, attrs);
  }
  let current = doc;
  let lastStatus: LocateStatus = "empty_edit";
  for (const part of parts) {
    const result = applySingleEditToRichDoc(current, part, attrs);
    if (!isApplyableStatus(result.status)) return result;
    current = result.doc;
    lastStatus = result.status;
  }
  return { status: lastStatus, doc: current };
}

function probeSingleRichEdit(
  doc: JSONContent,
  edit: SuggestionEdit
): LocateStatus {
  if (isPositionedImageMove(edit) && edit.removeImage) {
    const removal = locateImageRemoval(doc, edit.removeImage);
    if (removal !== "located") return removal;
    return probeSingleRichEdit(doc, { ...edit, removeImage: undefined });
  }
  if (edit.removeImage) {
    return locateImageRemoval(doc, edit.removeImage);
  }
  const index = flattenForAnchor(doc);
  const located = locateScopedEdit(index, edit);
  if (located.status === "located" && !edit.scope) {
    if (checkCrossCell(index, located.deleteStart, located.deleteEnd)) {
      return "cross_cell";
    }
  }
  return located.status;
}

export function probeRichEdit(
  doc: JSONContent,
  edit: SuggestionEdit
): LocateStatus {
  const parts = suggestionEditParts(edit);
  let sawLocated = false;
  for (const part of parts) {
    const status = probeSingleRichEdit(doc, part);
    if (!isApplyableStatus(status)) return status;
    if (status === "located") sawLocated = true;
  }
  return sawLocated ? "located" : "append";
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
  doc.content = doc.content.filter((block, index) => {
    if (keepEmptyParagraphBeforeCitationHeading(block, doc.content?.[index + 1])) {
      return true;
    }
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
  acceptPendingImageSuggestions(cloned, markId);

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

/**
 * Keep insert/delete marks in the doc but flip them from preview (`pending`)
 * to a committed tracked change (`accepted`). Preview stripping only removes
 * pending AI marks, so accepted revisions survive after the suggestion card
 * is resolved.
 */
export function commitSuggestionMarksById(
  doc: JSONContent,
  markId: string
): JSONContent {
  const cloned: JSONContent = JSON.parse(JSON.stringify(doc));

  function visit(node: JSONContent) {
    if (
      node.type === "imageInline" &&
      (node.attrs as { suggestionId?: string | null } | undefined)?.suggestionId ===
        markId
    ) {
      const next = { ...(node.attrs ?? {}) };
      delete next.suggestionId;
      delete next.suggestionKind;
      node.attrs = next;
    }
    if (node.type === "text" && node.marks?.length) {
      node.marks = node.marks.map((mark) => {
        const attrs = mark.attrs as { id?: string; status?: string } | undefined;
        if (
          attrs?.id !== markId ||
          attrs.status !== "pending" ||
          (mark.type !== suggestionInsertMarkName &&
            mark.type !== suggestionDeleteMarkName)
        ) {
          return mark;
        }
        return {
          ...mark,
          attrs: { ...attrs, status: "accepted" satisfies SuggestionStatus },
        };
      });
    }
    node.content?.forEach(visit);
  }

  visit(cloned);
  return cloned;
}

export function stripSuggestionMarksById(
  doc: JSONContent,
  markId: string
): JSONContent {
  const cloned: JSONContent = JSON.parse(JSON.stringify(doc));
  dropBlocksFullyMarked(cloned, suggestionInsertMarkName, markId);
  dropPendingImageSuggestions(cloned, markId);

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
    ...(attrs?.opIndex != null ? { opIndex: attrs.opIndex } : {}),
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
