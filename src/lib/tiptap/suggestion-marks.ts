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
  inclusive: true,
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
          const attrs = () => pendingMarkAttrs(authorId);
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

            const start = transaction.mapping.map(step.from, -1);
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
