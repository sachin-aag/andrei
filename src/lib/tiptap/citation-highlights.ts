import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import {
  citationNumberFromMarker,
  isNumericCitationMarker,
} from "@/lib/placeholders/citation-bracket";
import { BRACKET_SPAN_REGEX } from "@/lib/placeholders/find";

const citationKey = new PluginKey<DecorationSet>("citationHighlights");

export type CitationHighlight = {
  fromPos: number;
  toPos: number;
  number: number;
  text: string;
};

type TextChunk = { pmStart: number; text: string };

function pmOffsetToPos(chunks: TextChunk[], offset: number): number {
  let remaining = offset;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    if (remaining < chunk.text.length) {
      return chunk.pmStart + remaining;
    }
    if (remaining === chunk.text.length) {
      const next = chunks[i + 1];
      if (next) return next.pmStart;
      return chunk.pmStart + remaining;
    }
    remaining -= chunk.text.length;
  }
  const last = chunks[chunks.length - 1];
  return last ? last.pmStart + last.text.length : 0;
}

function scanBlockForCitationMarkers(
  block: PMNode,
  blockPos: number
): CitationHighlight[] {
  const chunks: TextChunk[] = [];
  block.forEach((child, offset) => {
    if (child.isText && child.text) {
      chunks.push({ pmStart: blockPos + 1 + offset, text: child.text });
    }
  });
  if (chunks.length === 0) return [];

  const flat = chunks.map((c) => c.text).join("");
  const highlights: CitationHighlight[] = [];
  BRACKET_SPAN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BRACKET_SPAN_REGEX.exec(flat)) !== null) {
    if (!isNumericCitationMarker(match[0])) continue;
    const number = citationNumberFromMarker(match[0]);
    if (number == null) continue;
    const fromPos = pmOffsetToPos(chunks, match.index);
    const toPos = pmOffsetToPos(chunks, match.index + match[0].length);
    if (toPos <= fromPos) continue;
    highlights.push({
      fromPos,
      toPos,
      number,
      text: match[0],
    });
  }
  return highlights;
}

export function findNumericCitationMarkersInPmDoc(doc: PMNode): CitationHighlight[] {
  const highlights: CitationHighlight[] = [];
  const blockNames = new Set([
    "paragraph",
    "heading",
    "tableCell",
    "tableHeader",
    "listItem",
    "blockquote",
  ]);

  doc.descendants((node, pos) => {
    if (!blockNames.has(node.type.name)) return true;
    highlights.push(...scanBlockForCitationMarkers(node, pos));
    return true;
  });

  return highlights;
}

export function buildCitationDecorations(
  doc: PMNode,
  highlights: CitationHighlight[]
): DecorationSet {
  const decos: Decoration[] = [];
  for (const highlight of highlights) {
    const slice = doc.textBetween(highlight.fromPos, highlight.toPos);
    if (!slice.trim()) continue;
    decos.push(
      Decoration.inline(highlight.fromPos, highlight.toPos, {
        class: "citation-ref",
        "data-citation-number": String(highlight.number),
      })
    );
  }
  return DecorationSet.create(doc, decos);
}

/**
 * Styles numeric `[n]` citation markers as static raised bubbles.
 * Decorations never persist into saved TipTap JSON.
 */
export function createCitationHighlightExtension() {
  return Extension.create({
    name: "citationHighlights",
    addProseMirrorPlugins() {
      const rebuild = (doc: PMNode) =>
        buildCitationDecorations(doc, findNumericCitationMarkersInPmDoc(doc));

      return [
        new Plugin<DecorationSet>({
          key: citationKey,
          state: {
            init(_, { doc }) {
              return rebuild(doc);
            },
            apply(tr, prev, _oldState, newState) {
              if (tr.docChanged) return rebuild(newState.doc);
              return prev.map(tr.mapping, tr.doc);
            },
          },
          props: {
            decorations(state) {
              return citationKey.getState(state) ?? DecorationSet.empty;
            },
          },
        }),
      ];
    },
  });
}
