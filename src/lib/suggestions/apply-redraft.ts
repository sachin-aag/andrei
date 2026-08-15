import type { SectionType } from "@/db/schema";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import { markdownToDoc, markdownToPlainText } from "@/lib/tiptap/markdown-to-doc";
import { normalizeBracketPlaceholdersInPlainText } from "@/lib/placeholders/normalize-bracket-placeholders";
import { setRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { setPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";

/** The exact plain-text value a redraft produces for a plain field (also used for previews). */
export function redraftPlainTextValue(markdown: string): string {
  return normalizeBracketPlaceholdersInPlainText(markdownToPlainText(markdown));
}

/**
 * Replace an entire field with an ai_redraft's markdown. Rich fields get a
 * converted TipTap doc (tables included); plain fields get flattened text.
 * Whole-field replacement — no anchor matching involved.
 */
export function applyRedraftToSection(
  content: Record<string, unknown>,
  section: SectionType,
  targetField: string,
  markdown: string
): Record<string, unknown> {
  if (isRichTargetField(section, targetField)) {
    return setRichFieldValue(content, targetField, markdownToDoc(markdown));
  }
  return setPlainTextFieldValue(
    content,
    targetField,
    redraftPlainTextValue(markdown)
  );
}
