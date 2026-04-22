import { Extension, Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Storage {
    trackChanges?: {
      enabled: boolean;
      authorId: string;
    };
  }
}
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";
import { createId } from "@paralleldrive/cuid2";

export const suggestionInsertMarkName = "suggestionInsert";
export const suggestionDeleteMarkName = "suggestionDelete";

export type SuggestionStatus = "pending" | "accepted" | "rejected";

export const SuggestionInsert = Mark.create({
  name: suggestionInsertMarkName,
  inclusive: true,
  addAttributes() {
    return {
      id: { default: null as string | null },
      authorId: { default: "" },
      status: { default: "pending" as SuggestionStatus },
      createdAt: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-suggestion-insert]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-suggestion-insert": "",
        class: "suggestion-insert",
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
    };
  },
  parseHTML() {
    return [{ tag: "span[data-suggestion-delete]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-suggestion-delete": "",
        class: "suggestion-delete",
      }),
      0,
    ];
  },
});

const trackChangesInsertKey = new PluginKey("trackChangesInsertMarks");

function pendingMarkAttrs(authorId: string) {
  return {
    id: createId(),
    authorId,
    status: "pending" as const,
    createdAt: new Date().toISOString(),
  };
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
        .setTextSelection(to)
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

      const authorId = editor.storage.trackChanges?.authorId ?? "";
      return editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .setMark(suggestionDeleteMarkName, pendingMarkAttrs(authorId))
        .setTextSelection(to)
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

      const authorId = editor.storage.trackChanges?.authorId ?? "";
      return editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .setMark(suggestionDeleteMarkName, pendingMarkAttrs(authorId))
        .setTextSelection(to)
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
        appendTransaction(transactions, _oldState, newState) {
          if (transactions.some((tr) => tr.getMeta("skipTrackChanges"))) return null;
          if (editor.storage.trackChanges?.enabled !== true) return null;
          const docChanging = transactions.filter((tr) => tr.docChanged);
          if (docChanging.length === 0) return null;
          if (docChanging.length > 1) return null;

          const transaction = docChanging[0]!;
          const authorId = editor.storage.trackChanges?.authorId ?? "";
          const attrs = () => pendingMarkAttrs(authorId);

          let tr = newState.tr;
          let changed = false;

          for (const step of transaction.steps) {
            if (!(step instanceof ReplaceStep)) continue;
            const slice = step.slice;
            if (!slice || slice.size === 0) continue;

            const start = transaction.mapping.map(step.from, 1);
            const end = start + slice.size;
            if (start >= end) continue;

            tr = tr.addMark(start, end, insertMarkType.create(attrs()));
            changed = true;
          }

          return changed ? tr.setMeta("skipTrackChanges", true) : null;
        },
      }),
    ];
  },
});
