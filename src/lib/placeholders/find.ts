import type { JSONContent } from "@tiptap/core";
import type { SectionType } from "@/db/schema";

export type Placeholder = {
  id: string;
  section: SectionType;
  contentPath: string;
  fromPos: number;
  toPos: number;
  text: string;
};

/**
 * Regex to find placeholders in the text.
 * Matches: `[` followed by anything except `]`, containing `<to be filled>`, followed by anything except `]`, and ending with `]`.
 * Examples: `[Batch No. 1: <to be filled>]`, `[<to be filled>]`
 */
export const PLACEHOLDER_REGEX = /\[[^\]]*<to be filled>[^\]]*\]/g;

/**
 * Scans a Tiptap JSON document and returns all placeholders found within it.
 */
export function findPlaceholders(
  doc: JSONContent,
  section: SectionType,
  contentPath: string
): Placeholder[] {
  const placeholders: Placeholder[] = [];

  function walk(node: JSONContent, pos: number): number {
    if (node.type === "text") {
      const text = node.text ?? "";
      let match;
      // Reset lastIndex just in case
      PLACEHOLDER_REGEX.lastIndex = 0;
      while ((match = PLACEHOLDER_REGEX.exec(text)) !== null) {
        placeholders.push({
          id: `${section}-${contentPath}-${pos + match.index}`,
          section,
          contentPath,
          fromPos: pos + match.index,
          toPos: pos + match.index + match[0].length,
          text: match[0],
        });
      }
      return pos + text.length;
    }

    if (node.type === "doc") {
      let cursor = pos;
      for (const ch of node.content ?? []) {
        cursor = walk(ch, cursor);
      }
      return cursor;
    }

    let cursor = pos + 1;
    if (node.content?.length) {
      for (const ch of node.content) {
        cursor = walk(ch, cursor);
      }
    }
    return cursor + 1;
  }

  if (doc) {
    walk(doc, 0);
  }

  return placeholders;
}
