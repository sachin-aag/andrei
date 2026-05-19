import { normalizeBracketPlaceholdersInPlainText } from "./normalize-bracket-placeholders";

/** `<to be filled>` or `<to be filled: label>` (not already inside `[label: …]`). */
const ANGLE_TO_BE_FILLED =
  /<\s*to\s+be\s+filled(?:\s*:\s*([^>]*))?\s*>/gi;

/** `[label: [[<to be filled>]] ]` or `[label: <to be filled>]]` → `[label: <to be filled>]`. */
const NESTED_LABEL_PLACEHOLDER =
  /\[([^\[\]]+?)\s*:\s*(?:\[\s*)*<\s*to\s+be\s+filled\s*>(?:\s*\])+\s*\]/gi;

function isInsideBracketLabel(before: string, after: string): boolean {
  return /\[[^\]]*:\s*$/.test(before) && /^\s*\]/.test(after);
}

function collapseNestedLabelPlaceholders(text: string): string {
  let prev = "";
  let out = text;
  while (out !== prev) {
    prev = out;
    out = out.replace(NESTED_LABEL_PLACEHOLDER, "[$1: <to be filled>]");
  }
  return out;
}

/**
 * Normalizes AI suggestion insert text to the same bracket placeholders used
 * in the editor (`[Label: <to be filled>]`), so Placeholders panel + highlights work.
 */
export function normalizeSuggestionInsertText(text: string): string {
  let out = text.trim();
  if (!out) return out;

  out = collapseNestedLabelPlaceholders(out);

  out = out.replace(
    ANGLE_TO_BE_FILLED,
    (match, label: string | undefined, offset: number, full: string) => {
      if (isInsideBracketLabel(full.slice(0, offset), full.slice(offset + match.length))) {
        return "<to be filled>";
      }
      const inner = label?.trim();
      if (inner) return `[${inner}: <to be filled>]`;
      return "[<to be filled>]";
    }
  );

  out = normalizeBracketPlaceholdersInPlainText(out);

  out = collapseNestedLabelPlaceholders(out);

  return out;
}
