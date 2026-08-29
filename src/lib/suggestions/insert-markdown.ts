import type { JSONContent } from "@tiptap/core";
import { isEmptyParagraphBlock } from "@/lib/suggestions/citations-at-end";
import { markdownHasTable, markdownToDoc } from "@/lib/tiptap/markdown-to-doc";
import { suggestionInsertMarkName } from "@/lib/tiptap/suggestion-marks";

type InsertMarkAttrs = {
  id: string;
  authorId: string;
  status: string;
  createdAt: string;
  kind: string;
};

export type MarkdownInsert =
  | { kind: "empty" }
  | { kind: "inline"; text: string }
  | { kind: "blocks"; content: JSONContent[] }
  | { kind: "table" };

const ATX_HEADING_RE = /^(#{1,3})\s+/;

function nodeContains(hay: JSONContent, needle: JSONContent): boolean {
  if (hay === needle) return true;
  return (hay.content ?? []).some((child) => nodeContains(child, needle));
}

function markInserted(node: JSONContent, attrs: InsertMarkAttrs): void {
  if (node.type === "text") {
    node.marks = [
      ...(node.marks ?? []),
      { type: suggestionInsertMarkName, attrs: { ...attrs } },
    ];
    return;
  }
  node.content?.forEach((child) => markInserted(child, attrs));
}

function isList(node: JSONContent | undefined): boolean {
  return node?.type === "bulletList" || node?.type === "orderedList";
}

function enclosingList(
  doc: JSONContent,
  node: JSONContent
): { list: JSONContent; itemIndex: number } | null {
  const lists: JSONContent[] = [];
  const walk = (current: JSONContent) => {
    if (isList(current)) lists.push(current);
    current.content?.forEach(walk);
  };
  walk(doc);
  for (const list of lists) {
    const items = list.content ?? [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && nodeContains(item, node)) {
        return { list, itemIndex: i };
      }
    }
  }
  return null;
}

function topLevelIndexContaining(doc: JSONContent, node: JSONContent): number {
  const content = doc.content ?? [];
  for (let i = 0; i < content.length; i++) {
    if (nodeContains(content[i]!, node)) return i;
  }
  return Math.max(0, content.length - 1);
}

function isSingleInlineParagraph(doc: JSONContent): boolean {
  const blocks = doc.content ?? [];
  if (blocks.length !== 1) return false;
  return blocks[0]?.type === "paragraph";
}

/**
 * Classify insert markdown: a single paragraph stays an inline splice so
 * mid-sentence `**bold**` still works. Lists, headings, and multi-block
 * inserts become sibling nodes.
 */
export function classifyMarkdownInsert(
  text: string,
  options?: { headingNodes?: boolean }
): MarkdownInsert {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "empty" };
  if (markdownHasTable(trimmed)) return { kind: "table" };
  const doc = markdownToDoc(trimmed, options);
  // A single ATX heading becomes a bold paragraph (or heading node), but it
  // is still a sibling block — not a mid-sentence splice.
  if (isSingleInlineParagraph(doc) && !ATX_HEADING_RE.test(trimmed)) {
    return { kind: "inline", text: trimmed };
  }
  return { kind: "blocks", content: doc.content ?? [] };
}

/**
 * Insert markdown-derived blocks after the block that contains `afterNode`
 * (or at the end of the doc). A bullet/ordered list inserted inside a list of
 * the same kind appends items onto that list instead of nesting a second list.
 */
export function insertMarkdownBlocks(
  doc: JSONContent,
  afterNode: JSONContent | null,
  blocks: JSONContent[],
  attrs: InsertMarkAttrs
): void {
  const inserted: JSONContent[] = JSON.parse(JSON.stringify(blocks));
  for (const block of inserted) markInserted(block, attrs);
  if (inserted.length === 0) return;

  if (
    afterNode &&
    inserted.length === 1 &&
    isList(inserted[0]) &&
    inserted[0]!.type
  ) {
    const enclosing = enclosingList(doc, afterNode);
    if (enclosing && enclosing.list.type === inserted[0]!.type) {
      const items = inserted[0]!.content ?? [];
      enclosing.list.content = [
        ...(enclosing.list.content ?? []).slice(0, enclosing.itemIndex + 1),
        ...items,
        ...(enclosing.list.content ?? []).slice(enclosing.itemIndex + 1),
      ];
      return;
    }
  }

  if (!Array.isArray(doc.content)) doc.content = [];
  if (!afterNode) {
    const last = doc.content[doc.content.length - 1];
    if (last && isEmptyParagraphBlock(last)) {
      doc.content = [...doc.content.slice(0, -1), ...inserted];
      return;
    }
    doc.content = [...doc.content, ...inserted];
    return;
  }
  const index = topLevelIndexContaining(doc, afterNode);
  doc.content = [
    ...doc.content.slice(0, index + 1),
    ...inserted,
    ...doc.content.slice(index + 1),
  ];
}
