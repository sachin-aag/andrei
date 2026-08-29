/**
 * Resolve a stored suggestion against live field content.
 * Pure / isomorphic — no DB.
 */
import type { JSONContent } from "@tiptap/core";
import type { SectionType } from "@/db/schema";
import type { CommentRecord } from "@/types/report";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import { AI_AUTHOR_ID } from "@/lib/ai/constants";
import {
  extractMergeBlocks,
  operationsCoverWholeField,
  type FieldContent,
  type PlannedOperation,
} from "@/lib/suggestions/diff-plan";
import {
  mergeField,
  type MergeConflict,
  type ThreeWayMergeResult,
} from "@/lib/suggestions/three-way-merge";
import {
  extractFieldContent,
  readSuggestionRecord,
} from "@/lib/suggestions/suggestion-record";
import { resolveSuggestionFieldPath } from "@/lib/suggestions/resolve-suggestion-field-path";
import { setPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { setRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { buildRedraftPreviewDoc } from "@/lib/tiptap/redraft-preview";
import { commitNarrativeSuggestionMarks } from "@/lib/suggestions/apply-narrative-suggestion";
import { injectSuggestionMarks } from "@/lib/tiptap/suggestion-inject";
import type { InjectAttrs } from "@/lib/suggestions/locator";

export type ResolvedSuggestionMerge = {
  path: string;
  current: FieldContent;
  merge: ThreeWayMergeResult | null;
  wholeField: boolean;
  operations: PlannedOperation[];
  conflicts: MergeConflict[];
};

export function resolveSuggestionMerge(args: {
  section: SectionType;
  comment: CommentRecord;
  sectionContent: Record<string, unknown>;
  fieldContentPath?: string;
}): ResolvedSuggestionMerge {
  const path = resolveSuggestionFieldPath(
    args.section,
    args.comment.contentPath,
    args.fieldContentPath ?? args.comment.contentPath ?? "narrative"
  );
  const current = extractFieldContent(
    args.sectionContent,
    args.section,
    path
  );
  const record = readSuggestionRecord(args.comment.content);
  if (!record) {
    return {
      path,
      current,
      merge: null,
      wholeField: args.comment.kind === "ai_redraft",
      operations: [],
      conflicts: [],
    };
  }
  const merge = mergeField(record.base, current, record.intent);
  const blocks = extractMergeBlocks(current);
  const operations = merge.operations;
  const wholeField =
    args.comment.kind === "ai_redraft" ||
    operationsCoverWholeField(operations, blocks);
  return {
    path,
    current,
    merge,
    wholeField,
    operations,
    conflicts: merge.status === "conflict" ? merge.conflicts : [],
  };
}

export function writeMergedField(args: {
  sectionContent: Record<string, unknown>;
  section: SectionType;
  path: string;
  merged: FieldContent;
}): Record<string, unknown> {
  if (typeof args.merged === "string") {
    return setPlainTextFieldValue(args.sectionContent, args.path, args.merged);
  }
  if (isRichTargetField(args.section, args.path)) {
    return setRichFieldValue(args.sectionContent, args.path, args.merged);
  }
  return args.sectionContent;
}

export function injectMergePreview(args: {
  current: JSONContent;
  intent: JSONContent;
  operations: readonly PlannedOperation[];
  wholeField: boolean;
  attrs: InjectAttrs;
}): JSONContent {
  const rewrite =
    args.wholeField ||
    args.operations.some((op) => op.classification === "rewrite");
  if (rewrite || args.operations.length === 0) {
    return buildRedraftPreviewDoc(args.current, args.intent, args.attrs);
  }
  let doc = args.current;
  for (const op of args.operations) {
    if (!op.deleteText && !op.insertText) continue;
    const injected = injectSuggestionMarks(
      doc,
      {
        anchorText: op.deleteText || op.insertText,
        deleteText: op.deleteText,
        insertText: op.insertText,
      },
      { ...args.attrs, opIndex: op.opIndex }
    );
    if (injected.located) doc = injected.doc;
  }
  return doc;
}

export function persistMergedAsTrackedChange(args: {
  current: JSONContent;
  merged: JSONContent;
  commentId: string;
  createdAt: string;
}): JSONContent {
  const preview = buildRedraftPreviewDoc(args.current, args.merged, {
    id: args.commentId,
    authorId: AI_AUTHOR_ID,
    status: "pending",
    createdAt: args.createdAt,
    kind: "redraft",
  });
  return commitNarrativeSuggestionMarks(preview, args.commentId);
}
