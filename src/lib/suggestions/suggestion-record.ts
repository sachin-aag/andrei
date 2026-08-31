/**
 * Additive suggestion record: persist `suggestionBase` + `suggestionIntent`
 * on the comment JSON payload. Dual-read: old rows without these fields
 * return null and keep the locator path. No schema migration.
 */
import type { DocumentType, SectionType } from "@/db/schema";
import {
  applyCommitToSectionContent,
  type CommitEditInput,
} from "@/lib/suggestions/apply-commit-content";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import {
  mergeField,
  type ThreeWayMergeResult,
} from "@/lib/suggestions/three-way-merge";
import type { FieldContent } from "@/lib/suggestions/diff-plan";

export type SuggestionRecord = {
  base: FieldContent;
  intent: FieldContent;
};

export function extractFieldContent(
  sectionContent: Record<string, unknown>,
  section: SectionType,
  targetField: string
): FieldContent {
  if (isRichTargetField(section, targetField)) {
    return getRichFieldValue(sectionContent, targetField);
  }
  return getPlainTextFieldValue(sectionContent, targetField);
}

export function readSuggestionRecord(
  content: string
): SuggestionRecord | null {
  try {
    const parsed = JSON.parse(content) as {
      suggestionBase?: unknown;
      suggestionIntent?: unknown;
    };
    if (parsed.suggestionBase === undefined || parsed.suggestionIntent === undefined) {
      return null;
    }
    return {
      base: parsed.suggestionBase as FieldContent,
      intent: parsed.suggestionIntent as FieldContent,
    };
  } catch {
    return null;
  }
}

export function buildSuggestionRecord(args: {
  sectionContent: Record<string, unknown>;
  section: SectionType;
  targetField: string;
  documentType: DocumentType;
  input: CommitEditInput;
}): SuggestionRecord | null {
  const base = extractFieldContent(
    args.sectionContent,
    args.section,
    args.targetField
  );
  const applied = applyCommitToSectionContent({
    content: args.sectionContent,
    section: args.section,
    targetField: args.targetField,
    documentType: args.documentType,
    input: args.input,
  });
  if (!applied.ok) return null;
  return {
    base,
    intent: extractFieldContent(applied.content, args.section, args.targetField),
  };
}

export function withSuggestionRecord<T extends object>(
  payload: T,
  record: SuggestionRecord | null
): T {
  if (!record) return payload;
  return {
    ...payload,
    suggestionBase: record.base,
    suggestionIntent: record.intent,
  };
}

/**
 * Dual-read resolve. Returns null when the row is legacy (no stored record)
 * so callers keep the locator path.
 */
export function mergeStoredSuggestion(args: {
  commentContent: string;
  current: FieldContent;
}): ThreeWayMergeResult | null {
  const record = readSuggestionRecord(args.commentContent);
  if (!record) return null;
  return mergeField(record.base, args.current, record.intent);
}
