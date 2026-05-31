import type { Placeholder } from "./find";

/** Replace a placeholder span in a plain-text field value. */
export function fillPlainTextPlaceholder(
  text: string,
  placeholder: Placeholder,
  value: string
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const { fromPos, toPos } = placeholder;
  if (fromPos < 0 || toPos > text.length || fromPos >= toPos) return null;

  const current = text.slice(fromPos, toPos);
  if (current !== placeholder.text) return null;

  return text.slice(0, fromPos) + trimmed + text.slice(toPos);
}
