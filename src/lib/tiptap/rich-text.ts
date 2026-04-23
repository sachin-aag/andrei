import type { JSONContent } from "@tiptap/core";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";

/** Empty Tiptap document (single empty paragraph). */
export function emptyDoc(): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

/** Convert legacy plain-text narrative to a minimal doc (paragraphs by line breaks). */
export function legacyStringToDoc(s: string): JSONContent {
  if (!s.trim()) return emptyDoc();
  const lines = s.split(/\n/);
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line.length ? [{ type: "text", text: line }] : [],
    })),
  };
}

/** Normalize DB/client value to JSONContent (handles legacy strings). */
export function normalizeRichField(v: unknown): JSONContent {
  if (v && typeof v === "object" && "type" in v && (v as JSONContent).type === "doc") {
    return v as JSONContent;
  }
  if (typeof v === "string") {
    return legacyStringToDoc(v);
  }
  return emptyDoc();
}

/** Plain text for export / AI (walks text nodes; paragraphs → newlines). */
export function richJsonToPlainText(doc: JSONContent | undefined | null): string {
  if (!doc) return "";
  const parts: string[] = [];

  function walk(node: JSONContent, blockSep: string) {
    if (node.type === "text") {
      parts.push(node.text ?? "");
      return;
    }
    const inner = node.content;
    if (!inner?.length) return;
    if (node.type === "paragraph") {
      const line: string[] = [];
      for (const ch of inner) walk(ch, "");
      parts.push(line.join("") + blockSep);
      return;
    }
    if (node.type === "heading") {
      for (const ch of inner) walk(ch, "");
      parts.push("\n");
      return;
    }
    if (node.type === "hardBreak") {
      parts.push("\n");
      return;
    }
    if (node.type === "doc") {
      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i]!;
        const isBlock = ["paragraph", "heading", "blockquote", "codeBlock", "bulletList", "orderedList"].includes(
          ch.type ?? ""
        );
        walk(ch, isBlock ? "\n\n" : "");
      }
      return;
    }
    if (node.type === "bulletList" || node.type === "orderedList") {
      for (const item of inner) walk(item, "\n");
      return;
    }
    if (node.type === "listItem") {
      for (const ch of inner) walk(ch, "\n");
      return;
    }
    for (const ch of inner) walk(ch, blockSep);
  }

  walk(doc, "\n");
  return parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Replace the first whitespace-tolerant occurrence of `anchorText` in `doc` with
 * `replacementText`. Returns `{ doc, replaced }`. If `anchorText` is empty or not
 * found, the original doc is returned unchanged with `replaced: false`.
 *
 * Whitespace tolerance: collapses runs of whitespace in both the anchor and the
 * doc text to a single space when searching, so minor newline/space drift between
 * what the model echoed and what's in the document still matches.
 */
export function replaceTextInDoc(
  doc: JSONContent,
  anchorText: string,
  replacementText: string
): { doc: JSONContent; replaced: boolean } {
  if (!anchorText || !anchorText.trim()) {
    return { doc, replaced: false };
  }

  // Collect every text node with its absolute offset in a flat plain-text
  // representation that does NOT include block separators (so anchors that
  // span paragraph breaks are matched too — we collapse whitespace anyway).
  type TextRef = { node: JSONContent; start: number; end: number };
  const refs: TextRef[] = [];
  let flat = "";

  function collect(node: JSONContent) {
    if (node.type === "text") {
      const text = node.text ?? "";
      const start = flat.length;
      flat += text;
      refs.push({ node, start, end: start + text.length });
      return;
    }
    if (node.content?.length) {
      for (let i = 0; i < node.content.length; i++) {
        collect(node.content[i]!);
        if (
          (node.type === "doc" || node.type === "paragraph" || node.type === "heading") &&
          i < node.content.length - 1
        ) {
          // separator that won't survive whitespace collapse
          flat += " ";
        }
      }
    }
  }
  collect(doc);

  const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
  const collapsedAnchor = collapse(anchorText);
  if (!collapsedAnchor) return { doc, replaced: false };

  // Build a map from collapsed-flat indices back to original-flat indices.
  // We walk `flat`, skipping leading whitespace runs and condensing internal
  // ones, recording for each character in the collapsed string its origin
  // index in `flat`.
  const collapsedToOrig: number[] = [];
  let collapsed = "";
  let inSpace = true; // treat start as space so leading whitespace is dropped
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i]!;
    if (/\s/.test(ch)) {
      if (!inSpace) {
        collapsed += " ";
        collapsedToOrig.push(i);
        inSpace = true;
      }
    } else {
      collapsed += ch;
      collapsedToOrig.push(i);
      inSpace = false;
    }
  }
  // strip trailing space we may have added
  while (collapsed.endsWith(" ")) {
    collapsed = collapsed.slice(0, -1);
    collapsedToOrig.pop();
  }

  const idx = collapsed.indexOf(collapsedAnchor);
  if (idx === -1) return { doc, replaced: false };

  const origStart = collapsedToOrig[idx]!;
  const lastCollapsedIdx = idx + collapsedAnchor.length - 1;
  const origLastChar = collapsedToOrig[lastCollapsedIdx]!;
  const origEnd = origLastChar + 1;

  // Apply the replacement across the affected text nodes. The first overlapping
  // node keeps its prefix + the full replacement; intermediate nodes are
  // emptied; the last node keeps its suffix. Empty text nodes are dropped from
  // their parent's content during a final cleanup pass.
  const affected = refs.filter((r) => r.end > origStart && r.start < origEnd);
  if (affected.length === 0) return { doc, replaced: false };

  for (let i = 0; i < affected.length; i++) {
    const r = affected[i]!;
    const localStart = Math.max(0, origStart - r.start);
    const localEnd = Math.min(r.end - r.start, origEnd - r.start);
    const original = r.node.text ?? "";
    if (i === 0) {
      r.node.text = original.slice(0, localStart) + replacementText + original.slice(localEnd);
    } else {
      r.node.text = original.slice(0, localStart) + original.slice(localEnd);
    }
  }

  // Drop now-empty text nodes from their parents.
  function prune(node: JSONContent): JSONContent {
    if (!node.content?.length) return node;
    node.content = node.content
      .map(prune)
      .filter((ch) => !(ch.type === "text" && (ch.text ?? "") === ""));
    return node;
  }
  return { doc: prune(doc), replaced: true };
}

/**
 * Append `paragraph` as a new paragraph at the end of `doc`. The paragraph may
 * contain newlines, in which case each line becomes its own paragraph.
 */
export function appendParagraphsToDoc(
  doc: JSONContent,
  paragraph: string
): JSONContent {
  if (!paragraph.trim()) return doc;
  const lines = paragraph.split(/\n/);
  const nodes: JSONContent[] = lines.map((line) => ({
    type: "paragraph",
    content: line.length ? [{ type: "text", text: line }] : [],
  }));
  if (doc.type !== "doc") return doc;
  return {
    ...doc,
    content: [...(doc.content ?? []), ...nodes],
  };
}

/** Remove track-change marks from a doc (engineer draft cleanup; keeps manager review marks elsewhere). */
export function stripSuggestionMarksFromDoc(doc: JSONContent): JSONContent {
  function visit(node: JSONContent): JSONContent {
    if (node.type === "text" && node.marks?.length) {
      const marks = node.marks.filter(
        (m) =>
          m.type !== suggestionInsertMarkName && m.type !== suggestionDeleteMarkName
      );
      const next: JSONContent = { ...node };
      if (marks.length > 0) next.marks = marks;
      else delete next.marks;
      return next;
    }
    if (node.content?.length) {
      return {
        ...node,
        content: node.content.map(visit),
      };
    }
    return node;
  }
  return visit(doc);
}
