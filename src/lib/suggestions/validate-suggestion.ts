import type { DocumentType, SectionType } from "@/db/schema";
import type { CommentRecord, EvaluationRecord } from "@/types/report";
import { sortedOpenSuggestionsForSection } from "@/lib/ai/suggestion-gating";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import {
  locateBlockIndex,
  locateRowIndex,
  locateTableBlockIndex,
} from "@/lib/suggestions/block-redraft";
import { hashContent } from "@/lib/ai/content-hash";
import {
  parseAiFixCommentContent,
  parseAiRedraftCommentContent,
  sectionContentHash,
} from "@/lib/ai/suggestion-gating";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";
import {
  isApplyableStatus,
  probePlainEdit,
  probeRichEdit,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { effectivePlainTextContentPath } from "@/lib/suggestions/resolve-suggestion-field-path";

export type SuggestionLocateStatus =
  | "locatable"
  | "not_found"
  | "ambiguous"
  | "cross_cell";

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
    scope: payload.scope,
  };
}

/**
 * Markdown flatten used ONLY for redraft field-hash staleness.
 * Must stay on richJsonToPlainText so in-flight redraft hashes remain stable
 * after the locator consolidation (do not reuse the canonical gate flattener).
 */
function plainTextForFieldHash(
  section: SectionType,
  sectionContent: unknown,
  contentPath: string
): string {
  const record = sectionContent as Record<string, unknown>;
  if (isRichTargetField(section, contentPath)) {
    const doc = getRichFieldValue(record, contentPath);
    return richJsonToPlainText(doc, { tableFormat: "markdown" });
  }
  return getPlainTextFieldValue(record, contentPath);
}

/**
 * Hash of ONE field's text — the staleness snapshot for redrafts. Per-field so
 * accepting a draft in field A never flags a pending draft in field B.
 */
export function fieldContentHash(
  section: SectionType,
  sectionContent: unknown,
  contentPath: string
): string {
  return hashContent(
    plainTextForFieldHash(section, sectionContent, contentPath)
  );
}

/** Check whether an open AI suggestion still applies to the current section content. */
export function validateSuggestionLocate(
  comment: CommentRecord,
  section: SectionType,
  sectionContent: unknown,
  /** When validating from a specific plain-text editor, resolves legacy paths. */
  fieldContentPath?: string,
  documentType: DocumentType = "investigation_report"
): SuggestionValidation {
  const currentHash = sectionContentHash(section, sectionContent, {
    documentType,
  });

  // Block edits (diff-based structural / insert / delete) locate a whole block,
  // not an anchored span. Validity = the block still resolves; locate is
  // authoritative, so a sibling edit changing the field never flags them stale.
  if (comment.kind === "ai_fix") {
    const fixPayload = parseAiFixCommentContent(comment.content);
    if (fixPayload.blockEdit) {
      const rp = comment.contentPath ?? "narrative";
      const doc = getRichFieldValue(sectionContent as Record<string, unknown>, rp);
      const op = fixPayload.blockEdit;
      let canApply = false;
      if (op.op === "insert") {
        canApply = true;
      } else if (op.op === "insertRow") {
        canApply = locateTableBlockIndex(doc, op) >= 0;
      } else if (op.op === "deleteRow") {
        const tableIdx = locateTableBlockIndex(doc, op);
        const table = tableIdx >= 0 ? doc.content?.[tableIdx] : undefined;
        canApply = table != null && locateRowIndex(table, op) >= 0;
      } else {
        const idx = locateBlockIndex(doc, op);
        const count = Math.max(1, op.blockCount ?? 1);
        canApply =
          idx >= 0 && idx + count <= (doc.content?.length ?? 0);
      }
      return {
        locateStatus: canApply ? "locatable" : "not_found",
        documentChanged: false,
        canApply,
        canPreview: canApply,
      };
    }
  }

  // Redrafts replace the whole field — always applicable. Staleness compares
  // the TARGET FIELD's hash only, so accepting other drafts never flags them.
  if (comment.kind === "ai_redraft") {
    const redraft = parseAiRedraftCommentContent(comment.content);
    const atGen = redraft.fieldHashAtSuggestion;
    const fieldHash = fieldContentHash(
      section,
      sectionContent,
      comment.contentPath ?? "narrative"
    );
    return {
      locateStatus: "locatable",
      documentChanged: Boolean(atGen && atGen !== fieldHash),
      canApply: true,
      canPreview: true,
    };
  }

  const path = effectivePlainTextContentPath(
    section,
    comment.contentPath,
    fieldContentPath
  );
  const edit = suggestionEditFromComment(comment);
  const record = sectionContent as Record<string, unknown>;

  let locateStatus: SuggestionLocateStatus;
  if (isRichTargetField(section, path)) {
    const doc = getRichFieldValue(record, path);
    const status = probeRichEdit(doc, edit);
    locateStatus = mapProbeStatus(status);
  } else {
    const plain = getPlainTextFieldValue(record, path);
    const status = probePlainEdit(plain, edit);
    locateStatus = mapProbeStatus(status);
  }

  const payload = parseAiFixCommentContent(comment.content);
  const atGen = payload.contentHashAtSuggestion;
  const documentChanged = Boolean(atGen && atGen !== currentHash);

  return {
    locateStatus,
    documentChanged,
    canApply: locateStatus === "locatable",
    canPreview: locateStatus === "locatable",
  };
}

function mapProbeStatus(
  status: ReturnType<typeof probeRichEdit>
): SuggestionLocateStatus {
  if (isApplyableStatus(status)) return "locatable";
  if (status === "ambiguous") return "ambiguous";
  if (status === "cross_cell") return "cross_cell";
  return "not_found";
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
  if (validation.locateStatus === "cross_cell") {
    return "This suggestion spans multiple table cells and cannot be applied safely. Dismiss it and use Suggest fixes again, or edit manually.";
  }
  if (validation.documentChanged) {
    return "The document changed after this suggestion was created and the edit no longer fits. Dismiss it or run Suggest fixes again.";
  }
  return "The suggested text is no longer in the document (another edit may have removed it). Dismiss it or run Suggest fixes again.";
}
