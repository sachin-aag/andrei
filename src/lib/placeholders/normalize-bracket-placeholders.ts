import { isCitationShapedBracket, repairedCitationBracket } from "./citation-bracket";
import {
  BRACKET_SPAN_REGEX,
  isActionablePlaceholderAngle,
  isActionablePlaceholderBracket,
  isLikelyHtmlTag,
  MAX_PLACEHOLDER_LABEL_LENGTH,
  NUMERIC_ONLY_BRACKET,
} from "./find";
import { compactPlaceholderLabel } from "./label";

const TO_BE_FILLED_ONLY = /^<?\s*to\s+be\s+filled\s*>?$/i;
const LABEL_THEN_TO_BE_FILLED =
  /^(.*?)\s*:\s*(?:<\s*)?to\s+be\s+filled(?:\s*>)?\s*$/i;
const ANGLE_TO_BE_FILLED_LABEL = /^to\s+be\s+filled\s*:\s*(.*)$/i;

/** Guidance-shaped `[...]` that may exceed the scanner length cap before compaction. */
function isGuidanceShapedBracket(match: string): boolean {
  if (!/^\[[^\]]+\]$/.test(match)) return false;
  if (NUMERIC_ONLY_BRACKET.test(match)) return false;
  if (isCitationShapedBracket(match)) return false;

  const inner = match.slice(1, -1);
  if (/^formula$/i.test(inner.trim())) return false;
  if (/not more than|not less than|\bNMT\b|\bNLT\b/i.test(inner)) return false;
  if (/to\s+be\s+filled/i.test(inner)) return false;
  if (/\be\.g\./i.test(inner)) return true;
  if (inner.includes(":")) return false;

  const trimmed = inner.trim();
  // Short / noun-ish labels: `[number]`, `[equipment ID]`, `[Personnel Name(s)]`.
  if (/^[\w\s./'()-]+$/i.test(trimmed)) return true;
  // Long instructional scaffolding from AI drafts (often includes commas):
  // `[Detailed narrative of the observation, including …]`.
  if (
    trimmed.length > MAX_PLACEHOLDER_LABEL_LENGTH &&
    /^[\w\s.,;/'()-]+$/i.test(trimmed)
  ) {
    return true;
  }
  return false;
}

function toCanonicalPlaceholder(label: string): string {
  const compacted = compactPlaceholderLabel(label);
  if (!compacted || TO_BE_FILLED_ONLY.test(compacted)) {
    return "<to be filled>";
  }
  return `<${compacted}>`;
}

function squareRangesIn(text: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  BRACKET_SPAN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BRACKET_SPAN_REGEX.exec(text)) !== null) {
    ranges.push({ from: match.index, to: match.index + match[0].length });
  }
  return ranges;
}

function normalizeAnglePlaceholdersInPlainText(text: string): string {
  const squares = squareRangesIn(text);
  return text.replace(/<[^<>]+>/g, (match, offset: number) => {
    const to = offset + match.length;
    if (squares.some((range) => offset >= range.from && to <= range.to)) {
      return match;
    }
    const inner = match.slice(1, -1);
    if (isLikelyHtmlTag(inner)) return match;
    if (/^\s*\d+\s*$/.test(inner)) return match;

    const labeled = ANGLE_TO_BE_FILLED_LABEL.exec(inner.trim());
    if (labeled) {
      const rawLabel = labeled[1]?.trim() ?? "";
      return rawLabel ? toCanonicalPlaceholder(rawLabel) : "<to be filled>";
    }

    if (TO_BE_FILLED_ONLY.test(inner.trim())) return "<to be filled>";

    if (!isActionablePlaceholderAngle(match)) {
      const trimmed = inner.trim();
      if (
        trimmed.length > MAX_PLACEHOLDER_LABEL_LENGTH &&
        /^[\w\s.,;/'()-]+$/i.test(trimmed) &&
        !/not more than|not less than|\bNMT\b|\bNLT\b/i.test(trimmed)
      ) {
        return toCanonicalPlaceholder(trimmed);
      }
      return match;
    }

    if (LABEL_THEN_TO_BE_FILLED.test(inner)) {
      const rawLabel = LABEL_THEN_TO_BE_FILLED.exec(inner)?.[1]?.trim() ?? "";
      return rawLabel ? toCanonicalPlaceholder(rawLabel) : "<to be filled>";
    }
    return toCanonicalPlaceholder(inner.trimEnd());
  });
}

/**
 * Makes placeholders consistent with `<label>` (crocodile brackets). Also
 * still accepts the legacy square form (`[number]`, `[Label: <to be filled>]`)
 * on AI insert and converts it. Compacts long labels to
 * MAX_PLACEHOLDER_LABEL_LENGTH.
 *
 * - Skips citation-style `[digits]`, `[file.pdf]`, `[name, p. N]`,
 *   `[Appendix B]`, `[PRQR-25-PR-005]`, `[SOP/DP/QA/008]`.
 * - Repairs mistaken `[cite: <to be filled>]` back to `[cite]`.
 * - Skips static bracketed prose (e.g. SOP acceptance criteria on import).
 * - Skips HTML tags in angle brackets (`<div>`, `<span>`).
 */
export function normalizeBracketPlaceholdersInPlainText(text: string): string {
  const squaresNormalized = text.replace(
    /\[[^\]]+\]/g,
    (match, offset: number, full: string) => {
      // `![alt](url)` — markdown image alts are not Placeholders-panel tokens.
      if (full[offset - 1] === "!" && full[offset + match.length] === "(") {
        return match;
      }
      if (NUMERIC_ONLY_BRACKET.test(match)) return match;

      const repaired = repairedCitationBracket(match);
      if (repaired) return repaired;
      if (isCitationShapedBracket(match)) return match;

      const inner = match.slice(1, -1);

      if (/^formula$/i.test(inner.trim())) return match;
      if (/not more than|not less than|\bNMT\b|\bNLT\b/i.test(inner)) {
        return match;
      }

      if (TO_BE_FILLED_ONLY.test(inner.trim())) {
        return "<to be filled>";
      }

      const labeled = LABEL_THEN_TO_BE_FILLED.exec(inner);
      if (labeled) {
        const rawLabel = labeled[1]?.trim() ?? "";
        if (!rawLabel) return "<to be filled>";
        return toCanonicalPlaceholder(rawLabel);
      }

      if (isGuidanceShapedBracket(match) || isActionablePlaceholderBracket(match)) {
        return toCanonicalPlaceholder(inner.trimEnd());
      }

      return match;
    }
  );

  return normalizeAnglePlaceholdersInPlainText(squaresNormalized);
}
