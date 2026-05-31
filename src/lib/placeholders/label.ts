/** Human-readable label from `[Batch No.: <to be filled>]` style tokens. */
export function extractPlaceholderLabel(text: string): string {
  let inner = text.replace(/^\[/, "").replace(/\]$/, "").trim();
  inner = inner.replace(/<?\s*to be filled\s*>?/gi, "").trim();
  inner = inner.replace(/[:\-]+\s*$/, "").trim();
  return inner || text;
}
