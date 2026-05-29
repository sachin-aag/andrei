import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { findPlaceholdersInPmDoc } from "../placeholders/find";
import type { Placeholder } from "../placeholders/find";
import type { SectionType } from "@/db/schema";
import type { Node as PMNode } from "@tiptap/pm/model";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";

const placeholderKey = new PluginKey<PluginStateData>("placeholderHighlights");

type PluginStateData = {
  decos: DecorationSet;
  placeholders: Placeholder[];
};

type PlaceholderHighlightOptions = {
  section: SectionType;
  contentPath: string;
};

/** True when a placeholder span overlaps pending AI suggestion track-change marks. */
export function rangeOverlapsPendingSuggestionMarks(
  doc: PMNode,
  from: number,
  to: number
): boolean {
  let overlaps = false;
  doc.nodesBetween(from, to, (node) => {
    if (overlaps || !node.isText) return !overlaps;
    for (const mark of node.marks) {
      const name = mark.type.name;
      if (name !== suggestionInsertMarkName && name !== suggestionDeleteMarkName) {
        continue;
      }
      const status = (mark.attrs as { status?: string }).status;
      if (status === "pending") {
        overlaps = true;
        return false;
      }
    }
    return true;
  });
  return overlaps;
}

export function buildPlaceholderDecorations(
  doc: PMNode,
  placeholders: Placeholder[]
): DecorationSet {
  const decos: Decoration[] = [];
  for (const p of placeholders) {
    if (p.toPos <= p.fromPos) continue;
    const slice = doc.textBetween(p.fromPos, p.toPos);
    // Skip zero-width slivers when a widget splits an inline decoration.
    if (!slice.trim() && !p.text.trim()) continue;

    const overSuggestion = rangeOverlapsPendingSuggestionMarks(
      doc,
      p.fromPos,
      p.toPos
    );
    decos.push(
      Decoration.inline(p.fromPos, p.toPos, {
        class: overSuggestion
          ? "placeholder-todo placeholder-todo-over-suggestion"
          : "placeholder-todo",
        ...(overSuggestion
          ? {
              style:
                "background-color: rgb(245 158 11 / 0.42); color: rgb(120 53 15); box-shadow: inset 0 0 0 1px rgb(217 119 6 / 0.9);",
            }
          : {}),
      })
    );
  }
  return DecorationSet.create(doc, decos);
}

/**
 * Returns true if the current selection exactly covers a placeholder span.
 * Used to suppress the comment BubbleMenu when clicking a placeholder.
 */
export function isSelectionOverPlaceholder(state: EditorState): boolean {
  const pluginState = placeholderKey.getState(state);
  if (!pluginState) return false;
  const { from, to } = state.selection;
  return pluginState.placeholders.some(
    (p) => p.fromPos === from && p.toPos === to
  );
}

/**
 * Tiptap extension that highlights actionable bracketed spans: `to be filled`
 * tokens and other non-numeric `[...]` guidance the model may emit.
 *
 * Clicking a placeholder selects its full text range so the user can
 * immediately type a replacement — ProseMirror's native selection-replace
 * handles the rest.
 */
export const PlaceholderHighlightExtension = Extension.create<PlaceholderHighlightOptions>({
  name: "placeholderHighlights",
  addOptions() {
    return {
      section: "define" as SectionType,
      contentPath: "narrative",
    };
  },
  addProseMirrorPlugins() {
    const { section, contentPath } = this.options;

    const scanPlaceholders = (doc: PMNode): Placeholder[] =>
      findPlaceholdersInPmDoc(doc, section, contentPath);

    return [
      new Plugin<PluginStateData>({
        key: placeholderKey,
        state: {
          init(_, { doc }) {
            const placeholders = scanPlaceholders(doc);
            return {
              decos: buildPlaceholderDecorations(doc, placeholders),
              placeholders,
            };
          },
          apply(tr, prev, _oldState, newState) {
            if (tr.docChanged) {
              const placeholders = scanPlaceholders(newState.doc);
              return {
                decos: buildPlaceholderDecorations(newState.doc, placeholders),
                placeholders,
              };
            }
            return {
              decos: prev.decos.map(tr.mapping, tr.doc),
              placeholders: prev.placeholders,
            };
          },
        },
        props: {
          decorations(state) {
            return placeholderKey.getState(state)?.decos ?? DecorationSet.empty;
          },
          handleClick(view: EditorView, pos: number, event: MouseEvent) {
            const target = event.target as HTMLElement;
            if (!target.closest(".placeholder-todo")) return false;

            const pluginState = placeholderKey.getState(view.state);
            if (!pluginState) return false;

            const placeholder = pluginState.placeholders.find(
              (p) => pos >= p.fromPos && pos <= p.toPos
            );
            if (!placeholder) return false;

            const $from = view.state.doc.resolve(placeholder.fromPos);
            const $to = view.state.doc.resolve(placeholder.toPos);
            view.dispatch(
              view.state.tr.setSelection(
                TextSelection.create(view.state.doc, $from.pos, $to.pos)
              )
            );
            return true;
          },
        },
      }),
    ];
  },
});
