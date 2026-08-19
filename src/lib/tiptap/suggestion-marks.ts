import { Extension, Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Storage {
    trackChanges?: {
      enabled: boolean;
      authorId: string;
    };
  }
}
import {
  Fragment,
  Slice,
  type Mark as PMMark,
  type Node as PMNode,
} from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";
import { createId } from "@paralleldrive/cuid2";

export const suggestionInsertMarkName = "suggestionInsert";
export const suggestionDeleteMarkName = "suggestionDelete";

export type SuggestionStatus = "pending" | "accepted" | "rejected";

/**
 * Discriminator on a suggestion mark. Drives a CSS modifier class so
 * different review types can read distinctly without new infra.
 *  - "fix"     → criterion fix from auto-eval (default; what ships in Part 2)
 *  - "grammar" → grammar / spelling polish (future)
 *  - "tone"    → tone / clarity rewrite     (future)
 *  - "removal" → "this paragraph adds nothing" (future)
 *  - "redraft" → wholesale section rewrite — uses a banner, not inline marks
 */
export type SuggestionKind = "fix" | "grammar" | "tone" | "removal" | "redraft";

export const SuggestionInsert = Mark.create({
  name: suggestionInsertMarkName,
  // Keep the next keystroke outside the insert <span>.
  inclusive: false,
  addAttributes() {
    return {
      id: { default: null as string | null },
      authorId: { default: "" },
      status: { default: "pending" as SuggestionStatus },
      createdAt: { default: "" },
      kind: { default: "fix" as SuggestionKind },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-suggestion-insert]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const kind = (HTMLAttributes.kind as SuggestionKind) ?? "fix";
    const isAi = HTMLAttributes.authorId === "ai";
    const evalId = HTMLAttributes.id as string | null | undefined;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-suggestion-insert": "",
        "data-suggestion-kind": kind,
        "data-suggestion-author": isAi ? "ai" : "human",
        ...(evalId ? { "data-eval-id": String(evalId) } : {}),
        class: `suggestion-insert suggestion-insert-${kind}${
          isAi ? " suggestion-insert-ai" : ""
        }`,
      }),
      0,
    ];
  },
});

export const SuggestionDelete = Mark.create({
  name: suggestionDeleteMarkName,
  inclusive: false,
  addAttributes() {
    return {
      id: { default: null as string | null },
      authorId: { default: "" },
      status: { default: "pending" as SuggestionStatus },
      createdAt: { default: "" },
      kind: { default: "fix" as SuggestionKind },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-suggestion-delete]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const kind = (HTMLAttributes.kind as SuggestionKind) ?? "fix";
    const isAi = HTMLAttributes.authorId === "ai";
    const evalId = HTMLAttributes.id as string | null | undefined;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-suggestion-delete": "",
        "data-suggestion-kind": kind,
        "data-suggestion-author": isAi ? "ai" : "human",
        ...(evalId ? { "data-eval-id": String(evalId) } : {}),
        class: `suggestion-delete suggestion-delete-${kind}${
          isAi ? " suggestion-delete-ai" : ""
        }`,
      }),
      0,
    ];
  },
});

const trackChangesInsertKey = new PluginKey("trackChangesInsertMarks");

function isSuggestionMarkName(name: string): boolean {
  return (
    name === suggestionInsertMarkName || name === suggestionDeleteMarkName
  );
}

function stripSuggestionMarksFromNode(node: PMNode): PMNode {
  if (node.isText) {
    const marks = node.marks.filter((mark) => !isSuggestionMarkName(mark.type.name));
    return marks.length === node.marks.length ? node : node.mark(marks);
  }
  if (node.content.size === 0) return node;
  return node.copy(stripSuggestionMarksFromFragment(node.content));
}

function stripSuggestionMarksFromFragment(fragment: Fragment): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach((child) => {
    nodes.push(stripSuggestionMarksFromNode(child));
  });
  return Fragment.from(nodes);
}

/**
 * Drop AI / track-change suggestion marks from a clipboard slice so paste never
 * rehydrates orphan highlights. When track changes is on, appendTransaction
 * re-marks the inserted range as a fresh insert.
 */
export function stripSuggestionMarksFromSlice(slice: Slice): Slice {
  return new Slice(
    stripSuggestionMarksFromFragment(slice.content),
    slice.openStart,
    slice.openEnd
  );
}

function pendingMarkAttrs(authorId: string) {
  return {
    id: createId(),
    authorId,
    status: "pending" as const,
    createdAt: new Date().toISOString(),
  };
}

function isPendingInsertByAuthor(mark: PMMark, authorId: string): boolean {
  if (mark.type.name !== suggestionInsertMarkName) return false;
  return mark.attrs.status === "pending" && mark.attrs.authorId === authorId;
}

function clampPos(state: EditorState, pos: number): number {
  return Math.max(0, Math.min(pos, state.doc.content.size));
}

/** Reuse the current insert-run id so adjacent typed characters merge. */
export function continuingInsertAttrs(
  state: EditorState,
  pos: number,
  authorId: string
) {
  const $pos = state.doc.resolve(clampPos(state, pos));
  const marks = [
    ...(state.storedMarks ?? []),
    ...$pos.marks(),
    ...($pos.nodeBefore?.isText ? $pos.nodeBefore.marks : []),
  ];
  const found = marks.find((mark) => isPendingInsertByAuthor(mark, authorId));
  return found ? { ...found.attrs } : pendingMarkAttrs(authorId);
}

export function sliceHasText(slice: Slice): boolean {
  return slice.content.textBetween(0, slice.content.size, "").length > 0;
}

function textPos(state: EditorState, pos: number): number {
  const $pos = state.doc.resolve(clampPos(state, pos));
  if ($pos.parent.inlineContent) return $pos.pos;
  return TextSelection.near($pos, 1).from;
}

function insertTrackedText(
  state: EditorState,
  insertAt: number,
  text: string,
  authorId: string
): Transaction | null {
  const insertMarkType = state.schema.marks[suggestionInsertMarkName];
  if (!insertMarkType || text.length === 0) return null;

  const insertEnd = insertAt + text.length;
  const tr = state.tr
    .insertText(text, insertAt)
    .addMark(
      insertAt,
      insertEnd,
      insertMarkType.create(continuingInsertAttrs(state, insertAt, authorId))
    )
    .setMeta("skipTrackChanges", true);
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertEnd), 1));
  return tr;
}

function sameTextblock(state: EditorState, a: number, b: number): boolean {
  const $a = state.doc.resolve(clampPos(state, a));
  const $b = state.doc.resolve(clampPos(state, b));
  return (
    $a.parent.inlineContent &&
    $b.parent.inlineContent &&
    $a.start() === $b.start()
  );
}

/**
 * Chrome may report the previous insert span (or an Enter split) as
 * `from < to`. Insert without deleting.
 *
 * Same textblock → type at the caret, so a later AI suggestion span is not
 * treated as the insert site. Cross-block (Enter) → type at `to` so the new
 * line stays a new line. `from === to` falls through to appendTransaction.
 */
export function trackChangesTextInputTransaction(
  state: EditorState,
  from: number,
  to: number,
  text: string,
  authorId: string
): Transaction | null {
  if (text.length === 0) return null;

  const { from: selFrom, to: selTo } = state.selection;
  if (state.doc.textBetween(selFrom, selTo, "").length > 0) {
    return trackChangesSelectionReplaceTransaction(
      state,
      selFrom,
      selTo,
      text,
      authorId
    );
  }

  if (from >= to) return null;

  const insertAt = sameTextblock(state, from, to)
    ? textPos(state, selTo)
    : textPos(state, to);

  return insertTrackedText(state, insertAt, text, authorId);
}

export function trackChangesSelectionReplaceTransaction(
  state: EditorState,
  from: number,
  to: number,
  text: string,
  authorId: string
) {
  if (from >= to || text.length === 0) return null;

  const deleteMarkType = state.schema.marks[suggestionDeleteMarkName];
  const insertMarkType = state.schema.marks[suggestionInsertMarkName];
  if (!deleteMarkType || !insertMarkType) return null;

  const insertAt = textPos(state, to);
  const insertEnd = insertAt + text.length;
  const tr = state.tr
    .addMark(from, to, deleteMarkType.create(pendingMarkAttrs(authorId)))
    .insertText(text, insertAt, insertAt)
    .addMark(
      insertAt,
      insertEnd,
      insertMarkType.create(continuingInsertAttrs(state, insertAt, authorId))
    )
    .setMeta("skipTrackChanges", true);
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertEnd), 1));
  return tr;
}

/**
 * Runs before StarterKit keymaps. Does not delete text — wraps the target range in
 * suggestionDelete so strikethrough shows until accept/reject.
 */
export const TrackChangesKeyboardExtension = Extension.create({
  name: "trackChangesKeyboard",
  priority: 200,
  addKeyboardShortcuts() {
    const editor = this.editor;

    const applyDeleteMarkOnSelection = () => {
      if (editor.storage.trackChanges?.enabled !== true) return false;
      const { state } = editor;
      const { selection } = state;
      if (selection.empty) return false;
      const authorId = editor.storage.trackChanges?.authorId ?? "";
      const { from, to } = selection;
      return editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .setMark(suggestionDeleteMarkName, pendingMarkAttrs(authorId))
        .setTextSelection(from)
        .run();
    };

    const backspaceMarkCharBefore = () => {
      if (editor.storage.trackChanges?.enabled !== true) return false;
      const { state } = editor;
      const { selection } = state;
      if (!selection.empty) return applyDeleteMarkOnSelection();
      const $from = selection.$from;
      if (!$from.parent.isTextblock) return false;
      if ($from.parentOffset === 0) return false;

      const from = $from.pos - 1;
      const to = $from.pos;
      if (from < $from.start()) return false;
      const between = state.doc.textBetween(from, to, "");
      if (between.length === 0) return false;

      const deleteMarkType = state.schema.marks[suggestionDeleteMarkName];
      if (!deleteMarkType) return false;

      if (state.doc.rangeHasMark(from, to, deleteMarkType)) {
        return editor.chain().focus().setTextSelection(from).run();
      }

      const authorId = editor.storage.trackChanges?.authorId ?? "";
      return editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .unsetMark(suggestionInsertMarkName)
        .setMark(suggestionDeleteMarkName, pendingMarkAttrs(authorId))
        .setTextSelection(from)
        .run();
    };

    const forwardDeleteMarkCharAfter = () => {
      if (editor.storage.trackChanges?.enabled !== true) return false;
      const { state } = editor;
      const { selection } = state;
      if (!selection.empty) return applyDeleteMarkOnSelection();
      const $from = selection.$from;
      if (!$from.parent.isTextblock) return false;

      const from = $from.pos;
      const to = $from.pos + 1;
      if (to > $from.end()) return false;

      const between = state.doc.textBetween(from, to, "");
      if (between.length === 0) return false;

      const deleteMarkType = state.schema.marks[suggestionDeleteMarkName];
      if (!deleteMarkType) return false;

      if (state.doc.rangeHasMark(from, to, deleteMarkType)) {
        return editor.chain().focus().setTextSelection(to).run();
      }

      const authorId = editor.storage.trackChanges?.authorId ?? "";
      return editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .unsetMark(suggestionInsertMarkName)
        .setMark(suggestionDeleteMarkName, pendingMarkAttrs(authorId))
        .setTextSelection(from)
        .run();
    };

    return {
      Backspace: backspaceMarkCharBefore,
      Delete: forwardDeleteMarkCharAfter,
    };
  },
});

/**
 * After typing / paste: mark inserted slices as suggestion insert. Low priority so this
 * appendTransaction runs late (stable insert marks).
 */
export const TrackChangesExtension = Extension.create({
  name: "trackChanges",
  priority: 1,
  addStorage() {
    return {
      enabled: false,
      authorId: "",
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const insertMarkType = editor.schema.marks[suggestionInsertMarkName];
    if (!insertMarkType) return [];

    return [
      new Plugin({
        key: trackChangesInsertKey,
        props: {
          /**
           * Always strip source suggestion marks on paste. AI highlights and
           * prior track-change formatting must not travel with the clipboard;
           * when TC is enabled, appendTransaction applies fresh insert marks.
           */
          transformPasted(slice) {
            return stripSuggestionMarksFromSlice(slice);
          },
          handleTextInput(view, from, to, text) {
            if (editor.storage.trackChanges?.enabled !== true) return false;
            const tr = trackChangesTextInputTransaction(
              view.state,
              from,
              to,
              text,
              editor.storage.trackChanges?.authorId ?? ""
            );
            if (!tr) return false;
            view.dispatch(tr);
            return true;
          },
        },
        appendTransaction(transactions, oldState, newState) {
          if (transactions.some((tr) => tr.getMeta("skipTrackChanges"))) return null;
          if (editor.storage.trackChanges?.enabled !== true) return null;
          const docChanging = transactions.filter((tr) => tr.docChanged);
          if (docChanging.length === 0) return null;
          if (docChanging.length > 1) return null;

          const transaction = docChanging[0]!;
          /** Programmatic sync (e.g. setContent) — do not mark baseline text as green insert. */
          if (transaction.getMeta("preventUpdate") === true) return null;

          const authorId = editor.storage.trackChanges?.authorId ?? "";
          const fullContentReplace = (step: ReplaceStep) =>
            step.from === 0 && step.to === oldState.doc.content.size;

          let tr = newState.tr;
          let changed = false;

          for (const step of transaction.steps) {
            if (!(step instanceof ReplaceStep)) continue;
            if (fullContentReplace(step)) {
              // Whole-document replace (setContent, etc.): never treat as a TC insert.
              continue;
            }
            const slice = step.slice;
            if (!slice || slice.size === 0 || !sliceHasText(slice)) continue;

            const start = transaction.mapping.map(step.from, -1);
            const end = start + slice.size;
            if (start >= end) continue;

            tr = tr.addMark(
              start,
              end,
              insertMarkType.create(
                continuingInsertAttrs(newState, start, authorId)
              )
            );
            changed = true;
          }

          return changed ? tr.setMeta("skipTrackChanges", true) : null;
        },
      }),
    ];
  },
});
