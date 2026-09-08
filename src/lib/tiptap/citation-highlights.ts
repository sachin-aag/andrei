import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import {
  citationNumberFromMarker,
  isNumericCitationMarker,
  isSourceCitationBracket,
  sourceCitationLinkSpans,
} from "@/lib/placeholders/citation-bracket";
import { BRACKET_SPAN_REGEX } from "@/lib/placeholders/find";
import { sourceCitationsByNumber } from "@/lib/suggestions/citations-at-end";

const citationKey = new PluginKey<DecorationSet>("citationHighlights");

export type CitationHighlight = {
  fromPos: number;
  toPos: number;
  kind: "numeric" | "source";
  number: number | null;
  text: string;
  /** Source bracket to open, when known. */
  openRaw: string | null;
};

export type CitationOpenHandlers = {
  onOpenCitation: (raw: string) => void;
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

function scanBlockForCitations(
  block: PMNode,
  blockPos: number,
  numberedSources: ReadonlyMap<number, string>
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
  const regex = new RegExp(BRACKET_SPAN_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(flat)) !== null) {
    const text = match[0];
    const fromPos = pmOffsetToPos(chunks, match.index);
    const toPos = pmOffsetToPos(chunks, match.index + text.length);
    if (toPos <= fromPos) continue;

    if (isNumericCitationMarker(text)) {
      const number = citationNumberFromMarker(text);
      if (number == null) continue;
      const parked = numberedSources.get(number);
      const parkedSpans = parked ? sourceCitationLinkSpans(parked) : [];
      highlights.push({
        fromPos,
        toPos,
        kind: "numeric",
        number,
        text,
        openRaw: parkedSpans[0]?.openRaw ?? parked ?? null,
      });
      continue;
    }

    if (isSourceCitationBracket(text)) {
      for (const span of sourceCitationLinkSpans(text)) {
        highlights.push({
          fromPos: pmOffsetToPos(chunks, match.index + span.from),
          toPos: pmOffsetToPos(chunks, match.index + span.to),
          kind: "source",
          number: null,
          text: text.slice(span.from, span.to),
          openRaw: span.openRaw,
        });
      }
    }
  }
  return highlights;
}

const CITATION_BLOCK_NAMES = new Set([
  "paragraph",
  "heading",
  "tableCell",
  "tableHeader",
  "listItem",
  "blockquote",
]);

export function findCitationHighlightsInPmDoc(doc: PMNode): CitationHighlight[] {
  const numberedSources = sourceCitationsByNumber(
    doc.textBetween(0, doc.content.size, "\n")
  );
  const highlights: CitationHighlight[] = [];

  doc.descendants((node, pos) => {
    if (!CITATION_BLOCK_NAMES.has(node.type.name)) return true;
    highlights.push(...scanBlockForCitations(node, pos, numberedSources));
    return true;
  });

  return highlights;
}

/** Numeric `[n]` markers only — used by tests and bubble styling. */
export function findNumericCitationMarkersInPmDoc(
  doc: PMNode
): CitationHighlight[] {
  return findCitationHighlightsInPmDoc(doc).filter(
    (highlight) => highlight.kind === "numeric"
  );
}

function citationDecorationAttrs(highlight: CitationHighlight): {
  class: string;
  "data-citation-number"?: string;
  "data-citation-open"?: string;
  "data-testid"?: string;
  role?: string;
  title?: string;
} {
  const className =
    highlight.kind === "numeric" ? "citation-ref" : "citation-source";
  const attrs: {
    class: string;
    "data-citation-number"?: string;
    "data-citation-open"?: string;
    "data-testid"?: string;
    role?: string;
    title?: string;
  } = { class: className };
  if (highlight.number != null) {
    attrs["data-citation-number"] = String(highlight.number);
  }
  if (highlight.openRaw) {
    attrs["data-citation-open"] = highlight.openRaw;
    attrs["data-testid"] = "citation-link";
    attrs.role = "link";
    attrs.title = `Open ${highlight.openRaw.slice(1, -1)}`;
  }
  return attrs;
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
      Decoration.inline(
        highlight.fromPos,
        highlight.toPos,
        citationDecorationAttrs(highlight)
      )
    );
  }
  return DecorationSet.create(doc, decos);
}

/**
 * Styles numeric `[n]` citation markers as raised bubbles and source
 * `[filename, p. N]` cites as links. Clicking a resolved cite opens that
 * attachment tab at the cited page. Decorations never persist into saved
 * TipTap JSON.
 */
export function createCitationHighlightExtension(
  getHandlers?: () => CitationOpenHandlers
) {
  return Extension.create({
    name: "citationHighlights",
    addProseMirrorPlugins() {
      const rebuild = (doc: PMNode) =>
        buildCitationDecorations(doc, findCitationHighlightsInPmDoc(doc));

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
            handleClick(_view, _pos, event) {
              const target = event.target as HTMLElement | null;
              if (!target) return false;
              const el = target.closest("[data-citation-open]");
              if (!el) return false;
              const raw = el.getAttribute("data-citation-open");
              if (!raw) return false;
              event.preventDefault();
              getHandlers?.().onOpenCitation(raw);
              return true;
            },
          },
        }),
      ];
    },
  });
}
