import type { JSONContent } from "@tiptap/core";

function marksEqual(
  a: JSONContent["marks"] | undefined,
  b: JSONContent["marks"] | undefined
): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

/** Merge consecutive sibling text nodes that share the same marks (e.g. after accepting a suggestion). */
export function coalesceAdjacentTextNodes(doc: JSONContent): JSONContent {
  const cloned: JSONContent = JSON.parse(JSON.stringify(doc));

  function visit(node: JSONContent) {
    if (!node.content?.length) return;
    for (const ch of node.content) visit(ch);

    const merged: JSONContent[] = [];
    for (const ch of node.content) {
      if (ch.type !== "text") {
        merged.push(ch);
        continue;
      }
      const prev = merged[merged.length - 1];
      if (prev?.type === "text" && marksEqual(prev.marks, ch.marks)) {
        prev.text = `${prev.text ?? ""}${ch.text ?? ""}`;
      } else {
        merged.push({ ...ch });
      }
    }
    node.content = merged;
  }

  visit(cloned);
  return cloned;
}
