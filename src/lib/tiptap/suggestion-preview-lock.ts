import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import {
  collectLockedSuggestionRanges,
  rangeTouchesLockedSuggestion,
  transactionEditsLockedSuggestion,
} from "@/lib/tiptap/suggestion-marks";

const suggestionPreviewLockKey = new PluginKey("suggestionPreviewLock");

export function skipLockedSuggestionOnBackspace(
  doc: PMNode,
  pos: number
): number | null {
  const locked = collectLockedSuggestionRanges(doc);
  const ending = locked.find((range) => range.to === pos);
  if (ending) return ending.from;
  const containing = locked.find((range) => pos > range.from && pos < range.to);
  return containing ? containing.from : null;
}

export function skipLockedSuggestionOnDelete(
  doc: PMNode,
  pos: number
): number | null {
  const locked = collectLockedSuggestionRanges(doc);
  const starting = locked.find((range) => range.from === pos);
  if (starting) return starting.to;
  const containing = locked.find((range) => pos > range.from && pos < range.to);
  return containing ? containing.to : null;
}

function moveCaret(view: EditorView, pos: number) {
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, pos))
  );
}

export function createSuggestionPreviewLockPlugin() {
  return new Plugin({
    key: suggestionPreviewLockKey,
    filterTransaction(tr, state) {
      return !transactionEditsLockedSuggestion(tr, state);
    },
    props: {
      handleTextInput(view, from, to) {
        return rangeTouchesLockedSuggestion(view.state.doc, from, to);
      },
      handlePaste(view) {
        const { from, to } = view.state.selection;
        return rangeTouchesLockedSuggestion(view.state.doc, from, to);
      },
      handleDrop(view) {
        const { from, to } = view.state.selection;
        return rangeTouchesLockedSuggestion(view.state.doc, from, to);
      },
      handleKeyDown(view, event) {
        const { from, to, empty } = view.state.selection;
        if (event.key === "Backspace") {
          if (!empty) {
            return rangeTouchesLockedSuggestion(view.state.doc, from, to);
          }
          const skipTo = skipLockedSuggestionOnBackspace(view.state.doc, from);
          if (skipTo == null) return false;
          moveCaret(view, skipTo);
          return true;
        }
        if (event.key === "Delete") {
          if (!empty) {
            return rangeTouchesLockedSuggestion(view.state.doc, from, to);
          }
          const skipTo = skipLockedSuggestionOnDelete(view.state.doc, from);
          if (skipTo == null) return false;
          moveCaret(view, skipTo);
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        compositionstart(view, event) {
          const { from, to } = view.state.selection;
          if (!rangeTouchesLockedSuggestion(view.state.doc, from, to)) {
            return false;
          }
          event.preventDefault();
          return true;
        },
      },
    },
  });
}

export const SuggestionPreviewLock = Extension.create({
  name: "suggestionPreviewLock",
  // Ahead of track-changes keyboard (200) so Backspace skips a locked run
  // instead of marking its last character as a human deletion.
  priority: 250,
  addProseMirrorPlugins() {
    return [createSuggestionPreviewLockPlugin()];
  },
});
