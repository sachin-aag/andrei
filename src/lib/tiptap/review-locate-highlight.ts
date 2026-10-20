import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  findReviewLocateSpan,
  type ReviewLocateTarget,
} from "@/lib/review/locate";

const reviewLocateKey = new PluginKey<DecorationSet>("reviewLocateHighlight");

export const REVIEW_LOCATE_REFRESH_META = "reviewLocateRefresh";
export const REVIEW_LOCATE_CLASS = "review-locate-highlight";
export const REVIEW_LOCATE_BLOCK_CLASS = "review-locate-block";

/** What this field should paint: a span, or the whole field when both are empty. */
export type ReviewLocatePaint = Pick<
  ReviewLocateTarget,
  "anchor" | "needle" | "occurrence"
>;

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

/** One in-block range for the target, or null when it is missing, repeated, or split across blocks. */
export function findReviewLocateRangeInPmDoc(
  doc: PMNode,
  target: ReviewLocatePaint
): { from: number; to: number } | null {
  const { text, posAt } = collectPmPlainText(doc);
  const span = findReviewLocateSpan(text, target);
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

function wholeFieldDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.forEach((node, offset) => {
    decorations.push(
      Decoration.node(offset, offset + node.nodeSize, {
        class: REVIEW_LOCATE_BLOCK_CLASS,
      })
    );
  });
  return DecorationSet.create(doc, decorations);
}

/** Exact span when it still locates; otherwise the whole field, never nothing. */
export function buildReviewLocateDecorations(
  doc: PMNode,
  target: ReviewLocatePaint | null
): DecorationSet {
  if (!target) return DecorationSet.empty;
  if (!target.anchor.trim() && !target.needle.trim()) {
    return wholeFieldDecorations(doc);
  }
  const range = findReviewLocateRangeInPmDoc(doc, target);
  if (!range) return wholeFieldDecorations(doc);
  return DecorationSet.create(doc, [
    Decoration.inline(range.from, range.to, { class: REVIEW_LOCATE_CLASS }),
  ]);
}

export function createReviewLocateHighlightExtension(
  getTarget: () => ReviewLocatePaint | null
) {
  return Extension.create({
    name: "reviewLocateHighlight",
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: reviewLocateKey,
          state: {
            init(_, state) {
              return buildReviewLocateDecorations(state.doc, getTarget());
            },
            apply(tr, prev, _old, state) {
              if (tr.docChanged || tr.getMeta(REVIEW_LOCATE_REFRESH_META)) {
                return buildReviewLocateDecorations(state.doc, getTarget());
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
