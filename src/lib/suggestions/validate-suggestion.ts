import type { JSONContent } from "@tiptap/core";
import type { SectionType } from "@/db/schema";
import type { CommentRecord, EvaluationRecord } from "@/types/report";
import { sortedOpenSuggestionsForSection } from "@/lib/ai/suggestion-gating";
import { isNarrativeTargetField } from "@/lib/ai/suggest-target-fields";
import {
  parseAiFixCommentContent,
  sectionContentHash,
} from "@/lib/ai/suggestion-gating";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";
import {
  canLocateEditInPlainText,
  type SuggestionEdit,
} from "@/lib/tiptap/suggestion-inject";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";

export type SuggestionLocateStatus = "locatable" | "not_found" | "ambiguous";

export type SuggestionValidation = {
  locateStatus: SuggestionLocateStatus;
  /** Section content hash differs from when this suggestion was generated. */
  documentChanged: boolean;
  canApply: boolean;
  canPreview: boolean;
};

export function suggestionEditFromComment(
  comment: CommentRecord
): SuggestionEdit {
  const payload = parseAiFixCommentContent(comment.content);
  return {
    anchorText: comment.anchorText ?? "",
    deleteText: payload.deleteText,
    insertText: payload.insertText,
  };
}

function plainTextForSuggestionField(
  sectionContent: unknown,
  contentPath: string
): string {
  const record = sectionContent as Record<string, unknown>;
  if (isNarrativeTargetField(contentPath)) {
    const narrative = record.narrative as JSONContent | undefined;
    return narrative?.type === "doc"
      ? richJsonToPlainText(narrative, { tableFormat: "markdown" })
      : "";
  }
  return getPlainTextFieldValue(record, contentPath);
}

/** Check whether an open ai_fix still uniquely locates in the current section content. */
export function validateSuggestionLocate(
  comment: CommentRecord,
  section: SectionType,
  sectionContent: unknown
): SuggestionValidation {
  const path = comment.contentPath ?? "narrative";
  const edit = suggestionEditFromComment(comment);
  const plain = plainTextForSuggestionField(sectionContent, path);
  const loc = canLocateEditInPlainText(plain, edit);

  const locateStatus: SuggestionLocateStatus = loc.ok
    ? "locatable"
    : loc.reason;

  const payload = parseAiFixCommentContent(comment.content);
  const currentHash = sectionContentHash(section, sectionContent);
  const atGen = payload.contentHashAtSuggestion;
  const documentChanged = Boolean(atGen && atGen !== currentHash);

  return {
    locateStatus,
    documentChanged,
    canApply: locateStatus === "locatable",
    canPreview: locateStatus === "locatable",
  };
}

export function countStaleOpenSuggestions(
  section: SectionType,
  comments: CommentRecord[],
  evaluations: EvaluationRecord[],
  sectionContent: unknown
): { total: number; stale: number } {
  const open = sortedOpenSuggestionsForSection(section, comments, evaluations);
  let stale = 0;
  for (const c of open) {
    if (!validateSuggestionLocate(c, section, sectionContent).canApply) stale++;
  }
  return { total: open.length, stale };
}

/** User-facing explanation when a suggestion cannot be applied. */
export function suggestionStaleMessage(validation: SuggestionValidation): string {
  if (validation.locateStatus === "ambiguous") {
    return "This suggestion matches multiple places in the text. Dismiss it and use Suggest fixes again, or edit manually.";
  }
  if (validation.documentChanged) {
    return "The document changed after this suggestion was created and the edit no longer fits. Dismiss it or run Suggest fixes again.";
  }
  return "The suggested text is no longer in the document (another edit may have removed it). Dismiss it or run Suggest fixes again.";
}
