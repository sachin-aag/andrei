import type { JSONContent } from "@tiptap/core";
import {
  fieldBodyInsertIndex,
  hasTrailingCitationBlock,
  isEmptyParagraphBlock,
} from "@/lib/suggestions/citations-at-end";

export type PairedBlockKind = "table" | "image";

function nodeContains(hay: JSONContent, needle: JSONContent): boolean {
  if (hay === needle) return true;
  return (hay.content ?? []).some((child) => nodeContains(child, needle));
}

function blockHasImage(node: JSONContent): boolean {
  if (node.type === "imageInline") return true;
  return (node.content ?? []).some(blockHasImage);
}

export function topLevelIndexContainingNode(
  doc: JSONContent,
  node: JSONContent
): number {
  const content = doc.content ?? [];
  for (let i = 0; i < content.length; i++) {
    if (nodeContains(content[i]!, node)) return i;
  }
  return Math.max(0, content.length - 1);
}

export function lastPairedBlockIndex(
  doc: JSONContent,
  kind: PairedBlockKind
): number | null {
  const end = fieldBodyInsertIndex(doc);
  const blocks = doc.content ?? [];
  for (let i = end - 1; i >= 0; i--) {
    const block = blocks[i]!;
    if (kind === "table" && block.type === "table") return i;
    if (kind === "image" && blockHasImage(block)) return i;
  }
  return null;
}

export function bodyAppendIndex(
  doc: JSONContent,
  beforePaired?: PairedBlockKind
): number {
  if (beforePaired) {
    const paired = lastPairedBlockIndex(doc, beforePaired);
    if (paired !== null) return paired;
  }
  return fieldBodyInsertIndex(doc);
}

export function spliceTopLevelNodes(
  doc: JSONContent,
  index: number,
  nodes: JSONContent[]
): void {
  if (nodes.length === 0) return;
  if (!Array.isArray(doc.content)) doc.content = [];
  const at = doc.content[index];
  const replaceTrailingEmpty =
    !hasTrailingCitationBlock(doc) &&
    Boolean(at) &&
    isEmptyParagraphBlock(at!) &&
    index === doc.content.length - 1;
  if (replaceTrailingEmpty) {
    doc.content.splice(index, 1, ...nodes);
    return;
  }
  doc.content.splice(index, 0, ...nodes);
}

export function insertNodesIntoFieldBody(
  doc: JSONContent,
  nodes: JSONContent[],
  opts?: { beforePairedBlock?: PairedBlockKind }
): void {
  spliceTopLevelNodes(doc, bodyAppendIndex(doc, opts?.beforePairedBlock), nodes);
}

export function insertNodesAfterTopLevelIndex(
  doc: JSONContent,
  afterIndex: number,
  nodes: JSONContent[]
): void {
  spliceTopLevelNodes(doc, afterIndex + 1, nodes);
}
