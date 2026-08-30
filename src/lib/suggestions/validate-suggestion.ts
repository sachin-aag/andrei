import type { DocumentType, SectionType } from "@/db/schema";
import type { CommentRecord, EvaluationRecord } from "@/types/report";
import { sortedOpenSuggestionsForSection } from "@/lib/ai/suggestion-gating";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
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
import { applyTableOperation } from "@/lib/suggestions/table-operation";

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
    insertImage: payload.insertImage,
    removeImage: payload.removeImage,
    scope: payload.scope,
    second: payload.second,
    placeBeforePairedBlock: payload.placeBeforePairedBlock,
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
  const payload = parseAiFixCommentContent(comment.content);
  const record = sectionContent as Record<string, unknown>;
  const atGen = payload.contentHashAtSuggestion;
  const hashChanged = Boolean(atGen && atGen !== currentHash);

  if (payload.tableOperationInvalid) {
    return {
      locateStatus: "not_found",
      documentChanged: true,
      canApply: false,
      canPreview: false,
    };
  }

  if (
    (payload.insertImage || payload.removeImage) &&
    !isRichTargetField(section, path)
  ) {
    return {
      locateStatus: "not_found",
      documentChanged: hashChanged,
      canApply: false,
      canPreview: false,
    };
  }

  if (payload.tableOperation) {
    if (!isRichTargetField(section, path)) {
      return {
        locateStatus: "not_found",
        documentChanged: hashChanged,
        canApply: false,
        canPreview: false,
      };
    }
    const doc = getRichFieldValue(record, path);
    const result = applyTableOperation(doc, payload.tableOperation, {
      section,
      targetField: path,
    });
    if (!result.ok) {
      return {
        locateStatus: "not_found",
        documentChanged: result.status === "stale" || hashChanged,
        canApply: false,
        canPreview: false,
      };
    }
    if (payload.second) {
      const secondStatus = probeRichEdit(doc, {
        anchorText: payload.second.anchorText,
        deleteText: payload.second.deleteText,
        insertText: payload.second.insertText,
        scope: payload.second.scope,
      });
      if (!isApplyableStatus(secondStatus)) {
        return {
          locateStatus: mapProbeStatus(secondStatus),
          documentChanged: hashChanged,
          canApply: false,
          canPreview: false,
        };
      }
    }
    return {
      locateStatus: "locatable",
      documentChanged: hashChanged,
      canApply: true,
      canPreview: true,
    };
  }

  const edit = suggestionEditFromComment(comment);

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

  return {
    locateStatus,
    documentChanged: hashChanged,
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

/**
 * Review queue: locatable cards first (so a new edit is not hidden behind a
 * stale sibling), then cards that no longer locate. Severity order is kept
 * inside each group.
 */
export function reviewOrderOpenSuggestions(
  section: SectionType,
  comments: CommentRecord[],
  evaluations: EvaluationRecord[],
  sectionContent: unknown
): CommentRecord[] {
  const open = sortedOpenSuggestionsForSection(section, comments, evaluations);
  const locatable: CommentRecord[] = [];
  const stale: CommentRecord[] = [];
  for (const comment of open) {
    if (validateSuggestionLocate(comment, section, sectionContent).canPreview) {
      locatable.push(comment);
    } else {
      stale.push(comment);
    }
  }
  return [...locatable, ...stale];
}

/** Card/preview target: first locatable in the review queue, else the stale head. */
export function firstPreviewableOpenSuggestion(
  section: SectionType,
  comments: CommentRecord[],
  evaluations: EvaluationRecord[],
  sectionContent: unknown
): CommentRecord | null {
  return (
    reviewOrderOpenSuggestions(
      section,
      comments,
      evaluations,
      sectionContent
    )[0] ?? null
  );
}

/**
 * Review queue plus which card to show. `preferredCommentId` wins when that
 * comment is still open in this section (newly generated chat edit, or a
 * focused mark). Otherwise the locatable head.
 */
export function preferredOpenSuggestion(args: {
  section: SectionType;
  comments: CommentRecord[];
  evaluations: EvaluationRecord[];
  sectionContent: unknown;
  preferredCommentId?: string | null;
}): {
  ordered: CommentRecord[];
  active: CommentRecord | null;
  index: number;
} {
  const ordered = reviewOrderOpenSuggestions(
    args.section,
    args.comments,
    args.evaluations,
    args.sectionContent
  );
  if (ordered.length === 0) {
    return { ordered, active: null, index: 0 };
  }
  if (args.preferredCommentId) {
    const index = ordered.findIndex((c) => c.id === args.preferredCommentId);
    if (index >= 0) {
      return { ordered, active: ordered[index]!, index };
    }
  }
  return { ordered, active: ordered[0]!, index: 0 };
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
