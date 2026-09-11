import { compactPlaceholderLabel } from "./label";
import { normalizeBracketPlaceholdersInPlainText } from "./normalize-bracket-placeholders";

/** `<to be filled>` or `<to be filled: label>` (not already inside `[label: …]`). */
const ANGLE_TO_BE_FILLED =
  /<\s*to\s+be\s+filled(?:\s*:\s*([^>]*))?\s*>/gi;

/** `[label: [[<to be filled>]] ]` or `[label: <to be filled>]]` → `<label>`. */
const NESTED_LABEL_PLACEHOLDER =
  /\[([^\[\]]+?)\s*:\s*(?:\[\s*)*<\s*to\s+be\s+filled\s*>(?:\s*\])+\s*\]/gi;

function isInsideBracketLabel(before: string, after: string): boolean {
  return /\[[^\]]*:\s*$/.test(before) && /^\s*\]/.test(after);
}

function toCanonicalPlaceholder(label: string): string {
  const compacted = compactPlaceholderLabel(label);
  return compacted ? `<${compacted}>` : "<to be filled>";
}

function collapseNestedLabelPlaceholders(text: string): string {
  let prev = "";
  let out = text;
  while (out !== prev) {
    prev = out;
    out = out.replace(NESTED_LABEL_PLACEHOLDER, (_m, label: string) => {
      return toCanonicalPlaceholder(label);
    });
  }
  return out;
}

/**
 * Normalizes AI suggestion insert text to the editor's placeholder form
 * (`<label>`), so Placeholders panel + highlights work. Legacy square
 * tokens (`[Label: <to be filled>]`) are converted. Citations stay in
 * square brackets. Long AI labels are compacted to the shared length limit.
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
      if (inner) return toCanonicalPlaceholder(inner);
      return "<to be filled>";
    }
  );

  out = normalizeBracketPlaceholdersInPlainText(out);

  out = collapseNestedLabelPlaceholders(out);

  return out;
}
