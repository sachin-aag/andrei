import type { Node as PMNode } from "@tiptap/pm/model";

/** Trim a bracket match to its first balanced closing `]`. */
export function clipBracketPlaceholderText(text: string): string {
  if (!text.startsWith("[")) return text;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return text.slice(0, i + 1);
    }
  }
  return text;
}

/**
 * When a widget sits inside `[...]`, ProseMirror splits the placeholder decoration
 * and leaves a trailing sliver. Bump the widget past the closing `]` instead.
 */
export function extendPosPastOpenBracketClose(doc: PMNode, pos: number): number {
  const scanStart = Math.max(0, pos - 400);
  const before = doc.textBetween(scanStart, pos);
  let depth = 0;
  for (let i = before.length - 1; i >= 0; i--) {
    const c = before[i]!;
    if (c === "]") depth++;
    else if (c === "[") {
      if (depth === 0) {
        const fromOpen = scanStart + i;
        const tail = doc.textBetween(
          fromOpen,
          Math.min(doc.content.size, fromOpen + 400)
        );
        const closeOffset = tail.indexOf("]");
        if (closeOffset !== -1) return fromOpen + closeOffset + 1;
        return pos;
      }
      depth--;
    }
  }
  return pos;
}
