import type { Content, Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";

export type SuggestionViewportPinKind = "insert" | "delete";

export type SuggestionViewportPin = {
  scroller: HTMLElement;
  previousTop: number | null;
  mappedPos: number | null;
  previousOverflowAnchor: string;
  previousScrollTop: number;
};

/** First overflow-y ancestor, else the document. */
export function nearestVerticalScroller(node: HTMLElement): HTMLElement {
  let current: HTMLElement | null = node.parentElement;
  while (current) {
    const overflowY = getComputedStyle(current).overflowY;
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay"
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return document.documentElement;
}

function markMatches(
  node: PMNode,
  markName: string,
  markId: string
): boolean {
  return node.marks.some(
    (mark) => mark.type.name === markName && mark.attrs.id === markId
  );
}

function blockIsFullyMarked(
  node: PMNode,
  markName: string,
  markId: string
): boolean {
  let hasMarked = false;
  let hasTextOutside = false;
  node.descendants((child) => {
    if (child.type.name === "imageInline") {
      const suggestionId = child.attrs.suggestionId as string | null | undefined;
      const kind = child.attrs.suggestionKind as string | null | undefined;
      if (suggestionId !== markId) {
        hasTextOutside = true;
        return;
      }
      const isDelete =
        kind === "delete" && markName === suggestionDeleteMarkName;
      const isInsert =
        kind !== "delete" && markName === suggestionInsertMarkName;
      if (isDelete || isInsert) hasMarked = true;
      else hasTextOutside = true;
      return;
    }
    if (!child.isText || !(child.text ?? "").length) return;
    if (markMatches(child, markName, markId)) hasMarked = true;
    else hasTextOutside = true;
  });
  return hasMarked && !hasTextOutside;
}

/**
 * Document position of the first insert (or delete) mark for this suggestion.
 * Insert is the green run that should stay on screen after Apply.
 */
export function findSuggestionMarkStartPos(
  doc: PMNode,
  markId: string,
  kind: SuggestionViewportPinKind = "insert"
): number | null {
  const markName =
    kind === "delete" ? suggestionDeleteMarkName : suggestionInsertMarkName;
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found != null) return false;
    if (node.type.name === "imageInline") {
      const suggestionId = node.attrs.suggestionId as string | null | undefined;
      const suggestionKind = node.attrs.suggestionKind as string | null | undefined;
      if (suggestionId !== markId) return true;
      const isDelete = suggestionKind === "delete";
      if ((kind === "delete") !== isDelete) return true;
      found = pos;
      return false;
    }
    if (!node.isText || !node.marks.length) return;
    if (markMatches(node, markName, markId)) {
      found = pos;
      return false;
    }
  });
  return found;
}

/**
 * Where the green (or remaining) run will sit after accept/dismiss:
 * skip fully delete-marked top-level blocks and delete-marked text before
 * the pin. Matches `acceptSuggestionMarksById` closely enough to restore
 * viewport after a wholesale `setContent`.
 */
export function mapSuggestionPinPosThroughAccept(
  doc: PMNode,
  markId: string,
  kind: SuggestionViewportPinKind = "insert"
): number | null {
  const pinPos = findSuggestionMarkStartPos(doc, markId, kind);
  if (pinPos == null) return null;

  const deleteName = suggestionDeleteMarkName;
  let deletedBefore = 0;

  doc.forEach((block, offset) => {
    if (offset >= pinPos) return;
    if (blockIsFullyMarked(block, deleteName, markId)) {
      deletedBefore += block.nodeSize;
      return;
    }
    block.nodesBetween(
      0,
      block.content.size,
      (node, pos) => {
        if (pos >= pinPos) return false;
        if (!node.isText || !markMatches(node, deleteName, markId)) return;
        const to = Math.min(pos + node.nodeSize, pinPos);
        deletedBefore += Math.max(0, to - pos);
      },
      offset
    );
  });

  return Math.max(1, pinPos - deletedBefore);
}

/** Keep `previousTop` at the same viewport Y by shifting `scrollTop`. */
export function shiftScrollerToKeepTop(
  scroller: HTMLElement,
  previousTop: number,
  nextTop: number
): void {
  const delta = previousTop - nextTop;
  if (delta === 0) return;
  scroller.scrollTop += delta;
}

function clampPos(doc: PMNode, pos: number): number {
  const max = Math.max(1, doc.content.size);
  return Math.max(1, Math.min(pos, max));
}

function placeSelectionWithoutScroll(
  editor: Editor,
  pos: number,
  options?: { focus?: boolean }
): void {
  const { state, view } = editor;
  if (view.isDestroyed) return;
  const safe = clampPos(state.doc, pos);
  try {
    const selection = TextSelection.near(state.doc.resolve(safe), 1);
    view.dispatch(state.tr.setSelection(selection));
  } catch {
    // Doc may be empty or the pos may not resolve; leave the mapped selection.
  }
  // Never focus an unfocused editor. Injecting a chat suggestion uses this
  // helper; focusing Define while the engineer is in the composer makes
  // `shouldSkipSuggestionDocSync` treat the field as locally dirty and skip
  // the green insert (CI: "keeps the document assistant open after a
  // generated suggestion lands").
  if (options?.focus && typeof view.dom.focus === "function") {
    view.dom.focus({ preventScroll: true });
  }
}

function coordsTopAtPos(editor: Editor, pos: number): number | null {
  try {
    const safe = clampPos(editor.state.doc, pos);
    return editor.view.coordsAtPos(safe).top;
  } catch {
    return null;
  }
}

export function snapshotSuggestionViewportPin(
  editor: Editor,
  markId: string,
  kind: SuggestionViewportPinKind = "insert"
): SuggestionViewportPin | null {
  if (editor.isDestroyed) return null;
  const scroller = nearestVerticalScroller(editor.view.dom);
  const pinPos = findSuggestionMarkStartPos(editor.state.doc, markId, kind);
  const mappedPos = mapSuggestionPinPosThroughAccept(
    editor.state.doc,
    markId,
    kind
  );
  let previousTop: number | null = null;
  if (pinPos != null) {
    previousTop = coordsTopAtPos(editor, pinPos);
  }
  if (previousTop == null) {
    const selector =
      kind === "delete"
        ? `.suggestion-delete[data-eval-id="${CSS.escape(markId)}"]`
        : `.suggestion-insert[data-eval-id="${CSS.escape(markId)}"]`;
    const el = editor.view.dom.querySelector<HTMLElement>(selector);
    previousTop = el?.getBoundingClientRect().top ?? null;
  }
  return {
    scroller,
    previousTop,
    mappedPos,
    previousOverflowAnchor: scroller.style.overflowAnchor,
    previousScrollTop: scroller.scrollTop,
  };
}

export function restoreSuggestionViewportPin(
  editor: Editor,
  pin: SuggestionViewportPin
): void {
  if (editor.isDestroyed) return;
  const { scroller, mappedPos, previousTop } = pin;
  const nextTop =
    mappedPos != null ? coordsTopAtPos(editor, mappedPos) : null;
  if (previousTop == null || nextTop == null) {
    scroller.scrollTop = pin.previousScrollTop;
    return;
  }
  shiftScrollerToKeepTop(scroller, previousTop, nextTop);
}

/**
 * Replace the editor doc without letting a large apply jump the viewport to
 * the end of the field (the next section). `setContent` maps the selection
 * through a full-document replace with assoc +1, which lands the caret at
 * the end; a focused contenteditable then scrolls that caret into view.
 * Overflow anchoring can also latch onto the following section heading
 * while the editor is briefly empty.
 *
 * Do not focus the editor unless it already had focus. Chat-generated
 * previews rewrite an unfocused field; focusing would steal the composer
 * and skip painting suggestion marks.
 */
export function setRichEditorContentPreservingViewport(
  editor: Editor,
  content: Content,
  options?: {
    pinSuggestionId?: string | null;
    pinKind?: SuggestionViewportPinKind;
  }
): void {
  if (editor.isDestroyed) return;
  const pinKind = options?.pinKind ?? "insert";
  const pinId = options?.pinSuggestionId ?? null;
  const pin = pinId
    ? snapshotSuggestionViewportPin(editor, pinId, pinKind)
    : null;
  const scroller = pin?.scroller ?? nearestVerticalScroller(editor.view.dom);
  const previousOverflowAnchor = pin?.previousOverflowAnchor ?? scroller.style.overflowAnchor;
  const previousScrollTop = pin?.previousScrollTop ?? scroller.scrollTop;
  const previousSelectionFrom = editor.state.selection.from;
  const hadFocus = editor.view.hasFocus();
  scroller.style.overflowAnchor = "none";

  editor.commands.setContent(content, { emitUpdate: false });

  // Dispatching a TextSelection can focus the view. Pin the caret after Apply
  // even if the field was not focused; restore a prior caret only when it was.
  // Chat inject (no pin, composer focused) must not steal Define's focus or
  // `shouldSkipSuggestionDocSync` skips the green insert.
  if (pin?.mappedPos != null) {
    placeSelectionWithoutScroll(editor, pin.mappedPos, { focus: hadFocus });
  } else if (hadFocus) {
    placeSelectionWithoutScroll(editor, previousSelectionFrom, {
      focus: true,
    });
  }
  if (pin) {
    restoreSuggestionViewportPin(editor, pin);
  } else {
    scroller.scrollTop = previousScrollTop;
  }

  const finish = () => {
    if (editor.isDestroyed) return;
    if (pin) restoreSuggestionViewportPin(editor, pin);
    else scroller.scrollTop = previousScrollTop;
    scroller.style.overflowAnchor = previousOverflowAnchor;
  };

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      requestAnimationFrame(finish);
    });
  } else {
    finish();
  }
}
