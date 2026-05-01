import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { findPlaceholders } from "../placeholders/find";
import type { JSONContent } from "@tiptap/core";

const placeholderKey = new PluginKey("placeholderHighlights");

/**
 * Tiptap extension that automatically highlights `[...<to be filled>...]` patterns
 * in the document as amber pills so they're visually distinct as actionable items.
 */
export const PlaceholderHighlightExtension = Extension.create({
  name: "placeholderHighlights",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: placeholderKey,
        state: {
          init(_, { doc }) {
            const decos: Decoration[] = [];
            const json = doc.toJSON() as JSONContent;
            // The section/contentPath don't matter for pure rendering, just the pos.
            const placeholders = findPlaceholders(json, "define", "narrative");
            for (const p of placeholders) {
              decos.push(
                Decoration.inline(p.fromPos, p.toPos, {
                  class: "placeholder-todo",
                })
              );
            }
            return DecorationSet.create(doc, decos);
          },
          apply(tr, oldSet, oldState, newState) {
            let set = oldSet.map(tr.mapping, tr.doc);

            // Recompute decorations if document changed. This is cheap enough for
            // typing, but if the doc gets massive we could optimize by only scanning
            // modified nodes.
            if (tr.docChanged) {
              const decos: Decoration[] = [];
              const json = newState.doc.toJSON() as JSONContent;
              const placeholders = findPlaceholders(json, "define", "narrative");
              for (const p of placeholders) {
                decos.push(
                  Decoration.inline(p.fromPos, p.toPos, {
                    class: "placeholder-todo",
                  })
                );
              }
              set = DecorationSet.create(newState.doc, decos);
            }
            return set;
          },
        },
        props: {
          decorations(state) {
            return placeholderKey.getState(state);
          },
        },
      }),
    ];
  },
});
