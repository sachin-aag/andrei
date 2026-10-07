import type { JSONContent } from "@tiptap/core";

export const MATH_INLINE_NODE_TYPE = "mathInline";
export const MATH_BLOCK_NODE_TYPE = "mathBlock";

/**
 * Any mark in the host schema. Suggestion insert/delete paint on the atom in
 * the live editor; schemas without those marks (import round-trip) still
 * construct. Block math defaults to no marks unless this is set.
 */
export const MATH_ATOM_ALLOWED_MARKS = "_";

/** Placeholder when the node has MathML/OMML but no LaTeX. */
export const MISSING_LATEX_MATH_ANCHOR = "$equation$";

export function isMathAtomNode(
  node: JSONContent | undefined | null
): boolean {
  return (
    node?.type === MATH_INLINE_NODE_TYPE || node?.type === MATH_BLOCK_NODE_TYPE
  );
}

/**
 * Canonical field text for a math atom. Chat `read_section` / locate / merge
 * all use this so `$latex$` can be quoted, deleted, and replaced.
 */
export function mathAtomDisplayText(node: JSONContent): string {
  const latex = node.attrs?.latex;
  if (typeof latex !== "string") return MISSING_LATEX_MATH_ANCHOR;
  const trimmed = latex.trim();
  if (!trimmed) return MISSING_LATEX_MATH_ANCHOR;
  if (trimmed.startsWith("$") && trimmed.endsWith("$") && trimmed.length >= 2) {
    return trimmed;
  }
  return `$${trimmed}$`;
}
