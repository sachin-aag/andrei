import type { PlainTextPreviewSegment } from "@/lib/suggestions/plain-text-preview";

/**
 * Overlay segments for manager track-changes on a plain string field.
 * Covers the current value only (inserts are green; deletions are omitted so
 * the mirror stays aligned with the textarea).
 *
 * Uses a common-prefix / common-suffix split — the usual case is typing at
 * the caret in a short Analyze field, not a multi-hunk patch.
 */
export function trackChangesOverlaySegments(
  baseline: string,
  current: string
): PlainTextPreviewSegment[] | null {
  if (baseline === current) return null;

  let prefix = 0;
  const maxPrefix = Math.min(baseline.length, current.length);
  while (prefix < maxPrefix && baseline[prefix] === current[prefix]) prefix++;

  let suffix = 0;
  const maxSuffix = Math.min(baseline.length, current.length) - prefix;
  while (
    suffix < maxSuffix &&
    baseline[baseline.length - 1 - suffix] === current[current.length - 1 - suffix]
  ) {
    suffix++;
  }

  const segments: PlainTextPreviewSegment[] = [];
  if (prefix > 0) {
    segments.push({ kind: "context", text: current.slice(0, prefix) });
  }
  const inserted = current.slice(prefix, current.length - suffix);
  if (inserted) {
    segments.push({ kind: "insert", text: inserted });
  }
  if (suffix > 0) {
    segments.push({ kind: "context", text: current.slice(current.length - suffix) });
  }

  if (segments.length === 0) return null;
  if (segments.every((seg) => seg.kind === "context")) return null;
  return segments;
}
