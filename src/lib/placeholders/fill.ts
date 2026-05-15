import type { Editor } from "@tiptap/core";
import type { Placeholder } from "./find";

/**
 * Replaces a placeholder in the editor with the given value.
 * Validates that the position range still contains the expected text before
 * making changes — if the document has shifted (e.g. concurrent edits) the
 * fill is silently skipped.
 *
 * Returns `true` if the replacement was applied, `false` otherwise.
 */
export function fillPlaceholder(
  editor: Editor,
  placeholder: Placeholder,
  value: string
): boolean {
  if (!value.trim()) return false;

  const { state } = editor;
  const { doc } = state;
  const { fromPos, toPos, text } = placeholder;

  // Bounds check
  if (fromPos < 0 || toPos > doc.content.size || fromPos >= toPos) return false;

  // Verify the text at the position still matches
  const currentText = doc.textBetween(fromPos, toPos, "");
  if (currentText !== text) return false;

  editor
    .chain()
    .focus()
    .deleteRange({ from: fromPos, to: toPos })
    .insertContentAt(fromPos, value)
    .run();

  return true;
}
