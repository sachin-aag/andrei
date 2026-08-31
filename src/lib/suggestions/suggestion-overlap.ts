import type { SectionType } from "@/db/schema";
import type { CommentRecord } from "@/types/report";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import { parseAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import {
  flattenForAnchor,
  locateEdit,
  locateScopedEdit,
  suggestionEditParts,
  type LocateResult,
} from "@/lib/suggestions/locator";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { resolveSuggestionFieldPath } from "@/lib/suggestions/resolve-suggestion-field-path";
import { suggestionEditFromComment } from "@/lib/suggestions/validate-suggestion";
import { resolveSuggestionMerge } from "@/lib/suggestions/resolve-merge";

export type FlatRange = { start: number; end: number };

export type SuggestionApplySpan = {
  commentId: string;
  path: string;
  ranges: FlatRange[];
  /** Whole-field rewrite (redraft / table op). Overlaps every other span on `path`. */
  wholeField: boolean;
};

export type BulkApplyPartition = {
  /** Locatable comments that do not overlap any other locatable comment. */
  independent: CommentRecord[];
  /** Overlapping groups, each in queue order. Apply recursively within a group. */
  overlapping: CommentRecord[][];
  /** Could not locate against the starting content. */
  unlocatableIds: string[];
};

function rangesOverlap(a: FlatRange, b: FlatRange): boolean {
  if (a.start === a.end && b.start === b.end) return a.start === b.start;
  if (a.start === a.end) return a.start >= b.start && a.start < b.end;
  if (b.start === b.end) return b.start >= a.start && b.start < a.end;
  return a.start < b.end && b.start < a.end;
}

export function suggestionApplySpansOverlap(
  a: SuggestionApplySpan,
  b: SuggestionApplySpan
): boolean {
  if (a.path !== b.path) return false;
  if (a.wholeField || b.wholeField) return true;
  for (const ra of a.ranges) {
    for (const rb of b.ranges) {
      if (rangesOverlap(ra, rb)) return true;
    }
  }
  return false;
}

/** True when every range of `inner` sits inside some range of `outer`. */
export function suggestionApplySpanContains(
  outer: SuggestionApplySpan,
  inner: SuggestionApplySpan
): boolean {
  if (outer.path !== inner.path) return false;
  if (outer.wholeField) return true;
  if (inner.wholeField) return false;
  if (inner.ranges.length === 0) return false;
  return inner.ranges.every((ir) =>
    outer.ranges.some((or) => or.start <= ir.start && ir.end <= or.end)
  );
}

/**
 * Same path and identical apply ranges. Equal-range refinements (a second
 * shrink of the same saved span) are not a covering rewrite.
 */
export function suggestionApplySpansHaveEqualRanges(
  a: SuggestionApplySpan,
  b: SuggestionApplySpan
): boolean {
  if (a.path !== b.path) return false;
  if (a.wholeField || b.wholeField) return false;
  if (a.ranges.length === 0 || a.ranges.length !== b.ranges.length) return false;
  return a.ranges.every(
    (ra, i) => ra.start === b.ranges[i]!.start && ra.end === b.ranges[i]!.end
  );
}

function locateToRange(
  located: LocateResult,
  fieldLength: number
): FlatRange | null {
  if (located.status === "append") {
    return { start: fieldLength, end: fieldLength };
  }
  if (located.status !== "located") return null;
  return { start: located.deleteStart, end: located.deleteEnd };
}

export function spanForSuggestionComment(args: {
  section: SectionType;
  comment: CommentRecord;
  sectionContent: Record<string, unknown>;
  fieldContentPath?: string;
}): SuggestionApplySpan | null {
  const path = resolveSuggestionFieldPath(
    args.section,
    args.comment.contentPath,
    args.fieldContentPath ?? args.comment.contentPath ?? "narrative"
  );

  if (args.comment.kind === "ai_redraft") {
    return { commentId: args.comment.id, path, ranges: [], wholeField: true };
  }

  const resolved = resolveSuggestionMerge({
    section: args.section,
    comment: args.comment,
    sectionContent: args.sectionContent,
    fieldContentPath: args.fieldContentPath,
  });
  if (resolved.merge) {
    return {
      commentId: args.comment.id,
      path,
      ranges: [],
      wholeField: resolved.wholeField,
    };
  }

  const payload = parseAiFixCommentContent(args.comment.content);
  if (payload.tableOperationInvalid) return null;
  if (payload.tableOperation) {
    return { commentId: args.comment.id, path, ranges: [], wholeField: false };
  }

  const parts = suggestionEditParts(suggestionEditFromComment(args.comment));
  const ranges: FlatRange[] = [];

  if (isRichTargetField(args.section, path)) {
    const doc = getRichFieldValue(args.sectionContent, path);
    const index = flattenForAnchor(doc);
    for (const part of parts) {
      const range = locateToRange(
        locateScopedEdit(index, part),
        index.text.length
      );
      if (!range) return null;
      ranges.push(range);
    }
  } else {
    const plain = getPlainTextFieldValue(args.sectionContent, path);
    for (const part of parts) {
      const range = locateToRange(locateEdit(plain, part), plain.length);
      if (!range) return null;
      ranges.push(range);
    }
  }

  return { commentId: args.comment.id, path, ranges, wholeField: false };
}

/**
 * Split a section's open queue into non-overlapping edits (safe to batch) and
 * overlapping clusters (must apply one-after-another against the updated doc).
 */
export function partitionBulkApplies(args: {
  section: SectionType;
  comments: readonly CommentRecord[];
  sectionContent: Record<string, unknown>;
}): BulkApplyPartition {
  const comments = [...args.comments];
  const spans = comments.map((comment) =>
    spanForSuggestionComment({
      section: args.section,
      comment,
      sectionContent: args.sectionContent,
    })
  );

  const locatableIdx: number[] = [];
  const unlocatableIds: string[] = [];
  for (let i = 0; i < comments.length; i++) {
    if (spans[i]) locatableIdx.push(i);
    else unlocatableIds.push(comments[i]!.id);
  }

  const parent = locatableIdx.map((_, i) => i);
  const find = (i: number): number => {
    let cur = i;
    while (parent[cur] !== cur) {
      parent[cur] = parent[parent[cur]!]!;
      cur = parent[cur]!;
    }
    return cur;
  };
  const union = (i: number, j: number) => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[a] = b;
  };

  for (let a = 0; a < locatableIdx.length; a++) {
    for (let b = a + 1; b < locatableIdx.length; b++) {
      if (
        suggestionApplySpansOverlap(
          spans[locatableIdx[a]!]!,
          spans[locatableIdx[b]!]!
        )
      ) {
        union(a, b);
      }
    }
  }

  const groups = new Map<number, CommentRecord[]>();
  for (let a = 0; a < locatableIdx.length; a++) {
    const root = find(a);
    const list = groups.get(root) ?? [];
    list.push(comments[locatableIdx[a]!]!);
    groups.set(root, list);
  }

  const independent: CommentRecord[] = [];
  const overlapping: CommentRecord[][] = [];
  const orderedGroups = [...groups.values()].toSorted(
    (a, b) => comments.indexOf(a[0]!) - comments.indexOf(b[0]!)
  );
  for (const group of orderedGroups) {
    if (group.length > 1) overlapping.push(group);
    else independent.push(group[0]!);
  }

  return { independent, overlapping, unlocatableIds };
}
