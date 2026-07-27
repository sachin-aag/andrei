import {
  locateEdit,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";
import { withLeadingSpaceIfNeeded } from "./locate-plain-text-edit";

export type PlainTextPreviewSegment = {
  kind: "context" | "delete" | "insert";
  text: string;
};

/**
 * Build track-change segments for a plain-text field from a pending suggestion.
 * Uses the same locateEdit predicate as apply — returns null when not applyable.
 */
export function buildPlainTextSuggestionPreview(
  value: string,
  deleteText: string,
  insertText: string,
  anchorText?: string
): PlainTextPreviewSegment[] | null {
  const edit: SuggestionEdit = {
    anchorText: anchorText ?? "",
    deleteText,
    insertText,
  };
  const loc = locateEdit(value, edit);

  if (loc.status === "append") {
    const ins = insertText.trim();
    if (!ins) return null;
    const insert = withLeadingSpaceIfNeeded(value, value.length, ins);
    return [
      { kind: "context", text: value },
      { kind: "insert", text: insert },
    ];
  }

  if (loc.status !== "located") return null;

  const ins = insertText.trim();
  const insert = withLeadingSpaceIfNeeded(value, loc.deleteStart, ins);

  if (loc.deleteStart < loc.deleteEnd) {
    return [
      { kind: "context", text: value.slice(0, loc.deleteStart) },
      { kind: "delete", text: value.slice(loc.deleteStart, loc.deleteEnd) },
      { kind: "insert", text: insert },
      { kind: "context", text: value.slice(loc.deleteEnd) },
    ];
  }

  // Pure insert after anchor
  return [
    { kind: "context", text: value.slice(0, loc.deleteStart) },
    { kind: "insert", text: insert },
    { kind: "context", text: value.slice(loc.deleteStart) },
  ];
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
