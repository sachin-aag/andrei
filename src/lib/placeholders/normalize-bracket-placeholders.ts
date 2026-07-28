import {
  isActionablePlaceholderBracket,
  NUMERIC_ONLY_BRACKET,
} from "./find";
import { compactPlaceholderLabel } from "./label";

const TO_BE_FILLED_ONLY = /^<?\s*to\s+be\s+filled\s*>?$/i;
const LABEL_THEN_TO_BE_FILLED =
  /^(.*?)\s*:\s*(?:<\s*)?to\s+be\s+filled(?:\s*>)?\s*$/i;

/** Guidance-shaped `[...]` that may exceed the scanner length cap before compaction. */
function isGuidanceShapedBracket(match: string): boolean {
  if (!/^\[[^\]]+\]$/.test(match)) return false;
  if (NUMERIC_ONLY_BRACKET.test(match)) return false;

  const inner = match.slice(1, -1);
  if (/^formula$/i.test(inner.trim())) return false;
  if (/not more than|not less than|\bNMT\b|\bNLT\b/i.test(inner)) return false;
  if (/to\s+be\s+filled/i.test(inner)) return false;
  if (/\be\.g\./i.test(inner)) return true;
  if (inner.includes(":")) return false;
  return /^[\w\s./-]+$/i.test(inner.trim());
}

function toCanonicalPlaceholder(label: string): string {
  const compacted = compactPlaceholderLabel(label);
  if (!compacted || TO_BE_FILLED_ONLY.test(compacted)) {
    return "[<to be filled>]";
  }
  return `[${compacted}: <to be filled>]`;
}

/**
 * Makes bracket placeholders consistent with `[Label: <to be filled>]` when AI
 * omits `<to be filled>` (for example `[number]`), and compacts long labels to
 * the shared MAX_PLACEHOLDER_LABEL_LENGTH.
 *
 * - Skips citation-style `[digits]`.
 * - Skips static bracketed prose (e.g. SOP acceptance criteria on import).
 * - Compacts labels on both guidance-only and existing `to be filled` forms.
 */
export function normalizeBracketPlaceholdersInPlainText(text: string): string {
  return text.replace(/\[[^\]]+\]/g, (match) => {
    if (NUMERIC_ONLY_BRACKET.test(match)) return match;

    const inner = match.slice(1, -1);

    if (/^formula$/i.test(inner.trim())) return match;
    if (/not more than|not less than|\bNMT\b|\bNLT\b/i.test(inner)) {
      return match;
    }

    if (TO_BE_FILLED_ONLY.test(inner.trim())) {
      return match;
    }

    const labeled = LABEL_THEN_TO_BE_FILLED.exec(inner);
    if (labeled) {
      const rawLabel = labeled[1]?.trim() ?? "";
      if (!rawLabel) return "[<to be filled>]";
      return toCanonicalPlaceholder(rawLabel);
    }

    if (isGuidanceShapedBracket(match) || isActionablePlaceholderBracket(match)) {
      return toCanonicalPlaceholder(inner.trimEnd());
    }

    return match;
  });
}
