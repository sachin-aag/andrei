import {
  applyPlainTextEdit,
  locateUniqueSpan,
  withLeadingSpaceIfNeeded,
} from "./locate-plain-text-edit";

export type PlainTextPreviewSegment = {
  kind: "context" | "delete" | "insert";
  text: string;
};

/**
 * Build track-change segments for a plain-text field from a pending suggestion.
 * Returns null when the edit cannot be located uniquely in the current value.
 */
export function buildPlainTextSuggestionPreview(
  value: string,
  deleteText: string,
  insertText: string,
  anchorText?: string
): PlainTextPreviewSegment[] | null {
  const del = deleteText.trim();
  const ins = insertText.trim();
  const anchor = (anchorText ?? "").trim();

  if (!del && !ins) return null;

  if (del) {
    const span = locateUniqueSpan(value, del);
    if (span) {
      const insert = withLeadingSpaceIfNeeded(value, span.start, ins);
      return [
        { kind: "context", text: value.slice(0, span.start) },
        { kind: "delete", text: value.slice(span.start, span.end) },
        { kind: "insert", text: insert },
        { kind: "context", text: value.slice(span.end) },
      ];
    }
  }

  if (anchor) {
    const span = locateUniqueSpan(value, anchor);
    if (span) {
      const insertAt = span.end;
      const insert = withLeadingSpaceIfNeeded(value, insertAt, ins);
      return [
        { kind: "context", text: value.slice(0, insertAt) },
        { kind: "insert", text: insert },
        { kind: "context", text: value.slice(insertAt) },
      ];
    }
    return null;
  }

  if (!del && ins) {
    const next = applyPlainTextEdit(value, {
      deleteText: "",
      insertText: ins,
    });
    if (!next || next === value) {
      return [
        { kind: "context", text: value },
        { kind: "insert", text: ins },
      ];
    }
    const insertAt = value.length;
    const insert = next.slice(insertAt);
    return [
      { kind: "context", text: value },
      { kind: "insert", text: insert },
    ];
  }

  return null;
}

export type SplitPlainTextPreview = {
  before: PlainTextPreviewSegment[];
  suggestion: PlainTextPreviewSegment[];
  after: PlainTextPreviewSegment[];
};

/** Split segments so action widgets can sit immediately after delete/insert marks. */
export function splitPlainTextPreviewSegments(
  segments: PlainTextPreviewSegment[]
): SplitPlainTextPreview {
  const firstSuggestionIdx = segments.findIndex(
    (s) => s.kind === "delete" || s.kind === "insert"
  );
  if (firstSuggestionIdx === -1) {
    return { before: segments, suggestion: [], after: [] };
  }

  let lastSuggestionIdx = firstSuggestionIdx;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i]!.kind === "delete" || segments[i]!.kind === "insert") {
      lastSuggestionIdx = i;
      break;
    }
  }

  return {
    before: segments.slice(0, firstSuggestionIdx),
    suggestion: segments.slice(firstSuggestionIdx, lastSuggestionIdx + 1),
    after: segments.slice(lastSuggestionIdx + 1),
  };
}
