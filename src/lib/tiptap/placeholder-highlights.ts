import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { findPlaceholdersInPmDoc } from "../placeholders/find";
import type { Placeholder } from "../placeholders/find";
import type { SectionType } from "@/db/schema";
import type { Node as PMNode } from "@tiptap/pm/model";

const placeholderKey = new PluginKey<PluginStateData>("placeholderHighlights");

type PluginStateData = {
  decos: DecorationSet;
  placeholders: Placeholder[];
};

type PlaceholderHighlightOptions = {
  section: SectionType;
  contentPath: string;
};

export function buildPlaceholderDecorations(
  doc: PMNode,
  placeholders: Placeholder[],
  focusedPlaceholderId: string | null = null
): DecorationSet {
  const decos: Decoration[] = [];
  for (const p of placeholders) {
    if (p.toPos <= p.fromPos) continue;
    const slice = doc.textBetween(p.fromPos, p.toPos);
    // Skip zero-width slivers when a widget splits an inline decoration.
    if (!slice.trim() && !p.text.trim()) continue;

    const isFocused = focusedPlaceholderId === p.id;
    const classes = [
      "placeholder-todo",
      isFocused ? "placeholder-todo-active" : null,
    ]
      .filter(Boolean)
      .join(" ");

    decos.push(
      Decoration.inline(p.fromPos, p.toPos, {
        class: classes,
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

export const placeholderRefreshMeta = "placeholderRefresh";

/**
 * Tiptap extension that highlights actionable bracketed spans: `to be filled`
 * tokens and other non-numeric `[...]` guidance the model may emit.
 *
 * Clicking a placeholder selects its full text range so the user can
 * immediately type a replacement — ProseMirror's native selection-replace
 * handles the rest.
 */
export function createPlaceholderHighlightExtension(
  getFocusedPlaceholderId: () => string | null,
  options: PlaceholderHighlightOptions
) {
  const { section, contentPath } = options;

  return Extension.create({
    name: "placeholderHighlights",
    addProseMirrorPlugins() {
      const scanPlaceholders = (doc: PMNode): Placeholder[] =>
        findPlaceholdersInPmDoc(doc, section, contentPath);

      const rebuild = (doc: PMNode, placeholders: Placeholder[]) => ({
        decos: buildPlaceholderDecorations(
          doc,
          placeholders,
          getFocusedPlaceholderId()
        ),
        placeholders,
      });

      return [
        new Plugin<PluginStateData>({
          key: placeholderKey,
          state: {
            init(_, { doc }) {
              const placeholders = scanPlaceholders(doc);
              return rebuild(doc, placeholders);
            },
            apply(tr, prev, _oldState, newState) {
              if (tr.docChanged || tr.getMeta(placeholderRefreshMeta)) {
                const placeholders = scanPlaceholders(newState.doc);
                return rebuild(newState.doc, placeholders);
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
}
