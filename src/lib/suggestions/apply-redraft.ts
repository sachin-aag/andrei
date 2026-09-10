import type { SectionType } from "@/db/schema";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import { markdownToDoc, markdownToPlainText } from "@/lib/tiptap/markdown-to-doc";
import { normalizeBracketPlaceholdersInPlainText } from "@/lib/placeholders/normalize-bracket-placeholders";
import {
  PlaceholderPreservationError,
  placeholderPreservationViolations,
} from "@/lib/placeholders/preservation";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import { getPlainTextFieldValue, setPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { getRichFieldValue, setRichFieldValue } from "@/lib/suggestions/rich-field-value";

/** The exact plain-text value a redraft produces for a plain field (also used for previews). */
export function redraftPlainTextValue(markdown: string): string {
  return normalizeBracketPlaceholdersInPlainText(markdownToPlainText(markdown));
}

function fieldPlainText(
  content: Record<string, unknown>,
  section: SectionType,
  targetField: string
): string {
  if (isRichTargetField(section, targetField)) {
    return flattenForAnchor(getRichFieldValue(content, targetField)).text;
  }
  return getPlainTextFieldValue(content, targetField);
}

/**
 * Replace an entire field with an ai_redraft's markdown. Rich fields get a
 * converted TipTap doc (tables included); plain fields get flattened text.
 * Whole-field replacement — no anchor matching involved.
 *
 * Refuses (throws {@link PlaceholderPreservationError}) when the replacement
 * would wipe a filled `[Label: value]` span unless `allowDropFilledPlaceholders`.
 */
export function applyRedraftToSection(
  content: Record<string, unknown>,
  section: SectionType,
  targetField: string,
  markdown: string,
  options?: { headingNodes?: boolean; allowDropFilledPlaceholders?: boolean }
): Record<string, unknown> {
  const before = fieldPlainText(content, section, targetField);
  const next = isRichTargetField(section, targetField)
    ? setRichFieldValue(
        content,
        targetField,
        markdownToDoc(markdown, { headingNodes: options?.headingNodes === true })
      )
    : setPlainTextFieldValue(content, targetField, redraftPlainTextValue(markdown));

  if (options?.allowDropFilledPlaceholders) return next;

  const after = fieldPlainText(next, section, targetField);
  const violations = placeholderPreservationViolations(before, after);
  if (violations.length > 0) {
    throw new PlaceholderPreservationError(violations);
  }
  return next;
}
