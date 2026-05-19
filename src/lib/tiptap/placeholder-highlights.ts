import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { findPlaceholders } from "../placeholders/find";
import type { Placeholder } from "../placeholders/find";
import type { SectionType } from "@/db/schema";
import type { JSONContent } from "@tiptap/core";

const placeholderKey = new PluginKey<PluginStateData>("placeholderHighlights");

type PluginStateData = {
  decos: DecorationSet;
  placeholders: Placeholder[];
};

type PlaceholderHighlightOptions = {
  section: SectionType;
  contentPath: string;
};

function buildDecorations(
  doc: import("@tiptap/pm/model").Node,
  placeholders: Placeholder[]
): DecorationSet {
  const decos: Decoration[] = [];
  for (const p of placeholders) {
    decos.push(
      Decoration.inline(p.fromPos, p.toPos, {
        class: "placeholder-todo",
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

    const scanPlaceholders = (doc: import("@tiptap/pm/model").Node): Placeholder[] => {
      const json = doc.toJSON() as JSONContent;
      return findPlaceholders(json, section, contentPath);
    };

    return [
      new Plugin<PluginStateData>({
        key: placeholderKey,
        state: {
          init(_, { doc }) {
            const placeholders = scanPlaceholders(doc);
            return {
              decos: buildDecorations(doc, placeholders),
              placeholders,
            };
          },
          apply(tr, prev, _oldState, newState) {
            if (tr.docChanged) {
              const placeholders = scanPlaceholders(newState.doc);
              return {
                decos: buildDecorations(newState.doc, placeholders),
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
