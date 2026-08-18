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
  type Selection,
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
  // Typing at the end of a tracked insert must sit *outside* the span.
  // inclusive: true wraps the next key in the same <span>, and Chrome then
  // reports that span as the replacement range (`handleTextInput` from < to).
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

/**
 * Keep consecutive keystrokes in one insert run. A new `id`/`createdAt` on every
 * character prevents ProseMirror from merging adjacent insert marks.
 *
 * With `inclusive: false`, `ResolvedPos.marks()` at the caret often misses the
 * run we just typed — also read the text node immediately before `pos`.
 */
export function continuingInsertAttrs(
  state: EditorState,
  pos: number,
  authorId: string
) {
  const stored = (state.storedMarks ?? []).find((mark) =>
    isPendingInsertByAuthor(mark, authorId)
  );
  if (stored) return { ...stored.attrs };

  const clamped = Math.max(0, Math.min(pos, state.doc.content.size));
  const $pos = state.doc.resolve(clamped);

  const atPos = $pos
    .marks()
    .find((mark) => isPendingInsertByAuthor(mark, authorId));
  if (atPos) return { ...atPos.attrs };

  const before = $pos.nodeBefore;
  if (before?.isText) {
    const fromBefore = before.marks.find((mark) =>
      isPendingInsertByAuthor(mark, authorId)
    );
    if (fromBefore) return { ...fromBefore.attrs };
  }

  return pendingMarkAttrs(authorId);
}

/** True when a replace slice actually inserted characters (not Enter / a split). */
export function replaceSliceContainsText(slice: Slice): boolean {
  let found = false;
  const walk = (node: PMNode) => {
    if (found) return;
    if (node.isText && (node.text?.length ?? 0) > 0) {
      found = true;
      return;
    }
    node.forEach(walk);
  };
  slice.content.forEach(walk);
  return found;
}

/**
 * After Enter the caret can sit on a block gap (parent = doc). Inserting there
 * creates extra paragraphs or joins the new line back into the previous one.
 */
export function textInsertPos(state: EditorState): number | null {
  const { $from } = state.selection;
  if ($from.parent.inlineContent) return $from.pos;
  if ($from.nodeAfter?.isTextblock) return $from.pos + 1;
  if ($from.nodeBefore?.isTextblock) return $from.pos - 1;

  let found: number | null = null;
  state.doc.descendants((node, pos) => {
    if (found != null) return false;
    if (node.isTextblock) {
      found = pos + 1;
      return false;
    }
    return true;
  });
  return found;
}

function selectionAfterInsert(doc: PMNode, pos: number): Selection {
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(clamped);
  if ($pos.parent.inlineContent) {
    return TextSelection.create(doc, clamped);
  }
  return TextSelection.near($pos);
}

function trackChangesCaretInsertTransaction(
  state: EditorState,
  text: string,
  authorId: string
): Transaction | null {
  const insertMarkType = state.schema.marks[suggestionInsertMarkName];
  if (!insertMarkType || text.length === 0) return null;

  const insertAt = textInsertPos(state);
  if (insertAt == null) return null;
  const $at = state.doc.resolve(insertAt);
  if (!$at.parent.inlineContent) return null;

  const insertEnd = insertAt + text.length;
  const tr = state.tr
    .insertText(text, insertAt)
    .addMark(
      insertAt,
      insertEnd,
      insertMarkType.create(continuingInsertAttrs(state, insertAt, authorId))
    )
    .setMeta("skipTrackChanges", true);

  tr.setSelection(selectionAfterInsert(tr.doc, insertEnd));
  return tr;
}

/**
 * `handleTextInput` replacement when Track changes is on.
 *
 * Empty caret + `from === to`: return null so the default insert runs;
 * `appendTransaction` then marks the new text as insert.
 *
 * Empty caret + `from < to`: Chrome often reports the previous insert-mark
 * span as the replacement range. Do **not** delete-mark that range (that is
 * what made every keystroke look like Backspace). Insert at the caret and
 * reuse the current insert-run attrs.
 *
 * Non-empty selection: real overtype — strikethrough the selection and insert.
 */
export function trackChangesTextInputTransaction(
  state: EditorState,
  from: number,
  to: number,
  text: string,
  authorId: string
): Transaction | null {
  if (text.length === 0) return null;

  if (!state.selection.empty) {
    const replaceFrom = from < to ? from : state.selection.from;
    const replaceTo = from < to ? to : state.selection.to;
    return trackChangesSelectionReplaceTransaction(
      state,
      replaceFrom,
      replaceTo,
      text,
      authorId
    );
  }

  if (from >= to) return null;

  return trackChangesCaretInsertTransaction(state, text, authorId);
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

  const insertAt = to;
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

  tr.setSelection(selectionAfterInsert(tr.doc, insertEnd));

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
            try {
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
            } catch {
              // A throw here leaves Chrome's DOM mutation unreconciled and the
              // next keystrokes look like random scrolling with no characters.
              return false;
            }
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
            if (!slice || slice.size === 0) continue;
            // Enter / splitBlock inserts a paragraph with no text. Marking that
            // range puts the caret on a block gap so the next character joins
            // the new line back into the previous one.
            if (!replaceSliceContainsText(slice)) continue;

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
