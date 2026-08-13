import { MAX_PLACEHOLDER_LABEL_LENGTH } from "./find";

/** Human-readable label from `[Batch No.: <to be filled>]` style tokens. */
export function extractPlaceholderLabel(text: string): string {
  let inner = text.replace(/^\[/, "").replace(/\]$/, "").trim();
  inner = inner.replace(/<?\s*to be filled\s*>?/gi, "").trim();
  inner = inner.replace(/[:\-]+\s*$/, "").trim();
  return inner || text;
}

const FILLER_PREFIX =
  /^(?:(?:name\/ids?|names?|ids?|identifiers?|details?|descriptions?)\s+(?:of|for)|(?:please\s+)?(?:enter|provide|fill(?:\s+in)?))\s+/i;

/**
 * Deterministically shortens an AI/guidance placeholder label so it fits
 * {@link MAX_PLACEHOLDER_LABEL_LENGTH} without a second model call.
 */
export function compactPlaceholderLabel(label: string): string {
  const original = label.trim().replace(/\s+/g, " ");
  if (!original) return original;

  let s = original;
  // Strip filler prefixes repeatedly (e.g. "Name/ID of …", "details of …").
  for (let i = 0; i < 3; i++) {
    const next = s.replace(FILLER_PREFIX, "").trim();
    if (next === s) break;
    s = next;
  }

  s = s.replace(/^[\s:\-–—]+|[\s:\-–—]+$/g, "").trim();
  if (!s) s = original;

  if (s.length <= MAX_PLACEHOLDER_LABEL_LENGTH) return s;

  const truncated = s.slice(0, MAX_PLACEHOLDER_LABEL_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  const minKeep = Math.floor(MAX_PLACEHOLDER_LABEL_LENGTH / 2);
  if (lastSpace >= minKeep) {
    return truncated.slice(0, lastSpace).trim();
  }
  return truncated.trim();
}
