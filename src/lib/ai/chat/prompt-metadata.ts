/**
 * Sanitize collaborator-controlled strings before embedding them in the chat
 * system prompt. Filenames and attachment descriptions are untrusted metadata —
 * without this, newlines/`#` can break out of a list item into fake prompt
 * headings and steer tool use.
 */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Flatten to a single safe line: strip controls, collapse whitespace, truncate.
 * Returns empty string when nothing usable remains.
 */
export function sanitizePromptMetadata(
  value: string | null | undefined,
  maxChars: number
): string {
  if (!value) return "";
  const flat = value
    .replace(CONTROL_CHARS, "")
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!flat) return "";
  // Neutralize markdown-heading / role-play prefixes that could read as instructions
  // if the surrounding bullet formatting is ever broken.
  const withoutFence = flat
    .replace(/^#{1,6}\s+/g, "")
    .replace(/^(system|assistant|developer)\s*:/i, "")
    .trim();
  if (!withoutFence) return "";
  return withoutFence.length <= maxChars
    ? withoutFence
    : `${withoutFence.slice(0, maxChars).trimEnd()}…`;
}

/** Quote for prompt embedding so spaces/punctuation stay data, not structure. */
export function quotePromptMetadata(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
