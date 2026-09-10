import {
  isCitationAppendInsert,
  normalizeCitationAppendInsert,
  plainCitationAppendSeparator,
} from "@/lib/suggestions/citations-at-end";
import {
  isApplyableStatus,
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
  anchorText?: string,
  second?: SuggestionEdit["second"]
): PlainTextPreviewSegment[] | null {
  const edit: SuggestionEdit = {
    anchorText: anchorText ?? "",
    deleteText,
    insertText,
  };
  const loc = locateEdit(value, edit);
  let segments: PlainTextPreviewSegment[] | null = null;

  if (loc.status === "append") {
    const ins = insertText.trim();
    if (ins) {
      const insert = withLeadingSpaceIfNeeded(value, value.length, ins);
      segments = [
        { kind: "context", text: value },
        { kind: "insert", text: insert },
      ];
    } else if (!second) {
      return null;
    } else {
      segments = [{ kind: "context", text: value }];
    }
  } else if (loc.status !== "located") {
    return null;
  } else {
    const ins = insertText.trim();
    const insert = withLeadingSpaceIfNeeded(value, loc.deleteStart, ins);

    if (loc.deleteStart < loc.deleteEnd) {
      segments = [
        { kind: "context", text: value.slice(0, loc.deleteStart) },
        { kind: "delete", text: value.slice(loc.deleteStart, loc.deleteEnd) },
        { kind: "insert", text: insert },
        { kind: "context", text: value.slice(loc.deleteEnd) },
      ];
    } else {
      segments = [
        { kind: "context", text: value.slice(0, loc.deleteStart) },
        { kind: "insert", text: insert },
        { kind: "context", text: value.slice(loc.deleteStart) },
      ];
    }
  }

  if (!second || !(second.deleteText.trim() || second.insertText.trim())) {
    return segments;
  }

  const secondLoc = locateEdit(value, {
    anchorText: second.anchorText ?? "",
    deleteText: second.deleteText,
    insertText: second.insertText,
    scope: second.scope,
  });
  if (!isApplyableStatus(secondLoc.status)) return null;
  const citeRaw = second.insertText.trim();
  if (!citeRaw) return segments;
  const cite = isCitationAppendInsert(citeRaw)
    ? normalizeCitationAppendInsert(value, citeRaw)
    : citeRaw;
  const citeInsert =
    secondLoc.status === "append"
      ? `${plainCitationAppendSeparator(value, cite)}${cite}`
      : cite;
  return [...segments, { kind: "insert", text: citeInsert }];
}

export type SplitPlainTextPreview = {
  before: PlainTextPreviewSegment[];
  suggestion: PlainTextPreviewSegment[];
  after: PlainTextPreviewSegment[];
};

export type PlainTextRange = { from: number; to: number };

/**
 * Offsets in the stored field value that correspond to preview delete runs.
 * Insert overlay text is not in the value, so it cannot be locked here.
 */
export function lockedValueRangesFromPreviewSegments(
  segments: PlainTextPreviewSegment[]
): PlainTextRange[] {
  let valueOffset = 0;
  const ranges: PlainTextRange[] = [];
  for (const seg of segments) {
    if (seg.kind === "insert") continue;
    const from = valueOffset;
    const to = valueOffset + seg.text.length;
    if (seg.kind === "delete" && from < to) {
      ranges.push({ from, to });
    }
    valueOffset = to;
  }
  return ranges;
}

export function selectionTouchesLockedPlainText(
  from: number,
  to: number,
  ranges: readonly PlainTextRange[]
): boolean {
  for (const range of ranges) {
    if (from === to) {
      if (from > range.from && from < range.to) return true;
      continue;
    }
    if (from < range.to && to > range.from) return true;
  }
  return false;
}

export function skipLockedPlainTextOnBackspace(
  pos: number,
  ranges: readonly PlainTextRange[]
): number | null {
  const ending = ranges.find((range) => range.to === pos);
  if (ending) return ending.from;
  const containing = ranges.find((range) => pos > range.from && pos < range.to);
  return containing ? containing.from : null;
}

export function skipLockedPlainTextOnDelete(
  pos: number,
  ranges: readonly PlainTextRange[]
): number | null {
  const starting = ranges.find((range) => range.from === pos);
  if (starting) return starting.to;
  const containing = ranges.find((range) => pos > range.from && pos < range.to);
  return containing ? containing.to : null;
}

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
  for (let i = firstSuggestionIdx + 1; i < segments.length; i++) {
    if (segments[i]!.kind === "context") break;
    lastSuggestionIdx = i;
  }

  return {
    before: segments.slice(0, firstSuggestionIdx),
    suggestion: segments.slice(firstSuggestionIdx, lastSuggestionIdx + 1),
    after: segments.slice(lastSuggestionIdx + 1),
  };
}
