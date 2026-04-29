import type { Node as PMNode } from "@tiptap/pm/model";

export type PmRange = { from: number; to: number };

const collapseWs = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Find the first whitespace-tolerant occurrence of `anchorText` in the given
 * ProseMirror doc and return the absolute PM positions for its start and end.
 *
 * Returns `null` if the anchor is empty or cannot be located.
 *
 * The implementation walks every text node, building a flat plain-text
 * representation along with a per-character map back to PM positions, then
 * performs the same collapsed-whitespace match used by `replaceTextInDoc` so
 * the two behave consistently.
 */
export function findAnchorRangeInDoc(
  doc: PMNode,
  anchorText: string
): PmRange | null {
  if (!anchorText || !anchorText.trim()) return null;

  let flat = "";
  const flatToPm: number[] = [];

  doc.descendants((node, pos) => {
    if (node.isText) {
      const text = node.text ?? "";
      for (let i = 0; i < text.length; i++) {
        flat += text[i];
        flatToPm.push(pos + i);
      }
    }
    return true;
  });

  if (flat.length === 0) return null;

  // Build collapsed flat text + index map back to flat positions.
  const collapsedToFlat: number[] = [];
  let collapsed = "";
  let inSpace = true;
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i]!;
    if (/\s/.test(ch)) {
      if (!inSpace) {
        collapsed += " ";
        collapsedToFlat.push(i);
        inSpace = true;
      }
    } else {
      collapsed += ch;
      collapsedToFlat.push(i);
      inSpace = false;
    }
  }
  while (collapsed.endsWith(" ")) {
    collapsed = collapsed.slice(0, -1);
    collapsedToFlat.pop();
  }

  const needle = collapseWs(anchorText);
  if (!needle) return null;

  const idx = collapsed.indexOf(needle);
  if (idx === -1) return null;

  const startFlat = collapsedToFlat[idx]!;
  const endFlat = collapsedToFlat[idx + needle.length - 1]! + 1;

  const fromPm = flatToPm[startFlat]!;
  const toPm = (flatToPm[endFlat - 1] ?? fromPm) + 1;
  return { from: fromPm, to: toPm };
}
