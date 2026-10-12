import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { uniqueTextSpan } from "@/lib/suggestions/locator";

const reviewLocateKey = new PluginKey<DecorationSet>("reviewLocateHighlight");

export const REVIEW_LOCATE_REFRESH_META = "reviewLocateRefresh";
export const REVIEW_LOCATE_CLASS = "review-locate-highlight";

/**
 * Plain text of a ProseMirror doc with a position per character.
 * A synthetic newline between blocks is recorded as -1 so a collapsed
 * match can still map back onto real text.
 */
export function collectPmPlainText(doc: PMNode): {
  text: string;
  posAt: number[];
} {
  let text = "";
  const posAt: number[] = [];
  let pendingBreak = false;

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      if (pendingBreak && text.length > 0) {
        text += "\n";
        posAt.push(-1);
      }
      pendingBreak = false;
      for (let i = 0; i < node.text.length; i++) {
        text += node.text[i]!;
        posAt.push(pos + i);
      }
      return false;
    }
    if (node.isBlock && node.type.name !== "doc") {
      pendingBreak = true;
    }
    return true;
  });

  return { text, posAt };
}

/** One in-block range for a unique needle, or null when it is missing, repeated, or split across blocks. */
export function findNeedleRangeInPmDoc(
  doc: PMNode,
  needle: string
): { from: number; to: number } | null {
  const trimmed = needle.trim();
  if (!trimmed) return null;
  const { text, posAt } = collectPmPlainText(doc);
  const span = uniqueTextSpan(text, trimmed);
  if (!span) return null;

  let from = -1;
  let to = -1;
  for (let i = span.start; i < span.end; i++) {
    const pos = posAt[i];
    if (pos == null || pos < 0) continue;
    if (from < 0) from = pos;
    to = pos + 1;
  }
  if (from < 0 || to <= from) return null;
  if (doc.resolve(from).parent !== doc.resolve(to).parent) return null;
  return { from, to };
}

export function buildReviewLocateDecorations(
  doc: PMNode,
  needle: string | null
): DecorationSet {
  if (!needle) return DecorationSet.empty;
  const range = findNeedleRangeInPmDoc(doc, needle);
  if (!range) return DecorationSet.empty;
  return DecorationSet.create(doc, [
    Decoration.inline(range.from, range.to, { class: REVIEW_LOCATE_CLASS }),
  ]);
}

export function createReviewLocateHighlightExtension(
  getNeedle: () => string | null
) {
  return Extension.create({
    name: "reviewLocateHighlight",
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: reviewLocateKey,
          state: {
            init(_, state) {
              return buildReviewLocateDecorations(state.doc, getNeedle());
            },
            apply(tr, prev, _old, state) {
              if (tr.docChanged || tr.getMeta(REVIEW_LOCATE_REFRESH_META)) {
                return buildReviewLocateDecorations(state.doc, getNeedle());
              }
              return prev.map(tr.mapping, tr.doc);
            },
          },
          props: {
            decorations(state) {
              return reviewLocateKey.getState(state) ?? DecorationSet.empty;
            },
          },
        }),
      ];
    },
  });
}
