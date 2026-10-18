import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import {
  isApplyableStatus,
  probePlainEdit,
  probeRichEdit,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import type { ProposedReviewEdit } from "./proposed-edit";
import type { ReviewSeverity } from "./severity";
import type { ReviewFindingDraft, ReviewRunContext } from "./types";

export function locatableEdit(args: {
  ctx: Pick<ReviewRunContext, "sections">;
  section: string;
  contentPath: string;
  edit: SuggestionEdit;
}): { record: Record<string, unknown>; edit: SuggestionEdit } | null {
  const insertText = normalizeSuggestionInsertText(args.edit.insertText);
  const edit: SuggestionEdit = { ...args.edit, insertText };
  const content = args.ctx.sections[args.section];
  if (!content || typeof content !== "object") return null;
  const record = content as Record<string, unknown>;
  if (isRichTargetField(args.section, args.contentPath)) {
    const doc = getRichFieldValue(record, args.contentPath);
    if (!isApplyableStatus(probeRichEdit(doc, edit))) return null;
  } else {
    const plain = getPlainTextFieldValue(record, args.contentPath);
    if (!isApplyableStatus(probePlainEdit(plain, edit))) return null;
  }
  return { record, edit };
}

/** Probe a span and stash it on the finding. Does not open a suggestion comment. */
export function locateProposedEdit(args: {
  ctx: Pick<ReviewRunContext, "sections">;
  section: string;
  contentPath: string;
  edit: SuggestionEdit;
  reasoning: string;
  kind: ProposedReviewEdit["kind"];
  severity?: ReviewSeverity;
}): ReviewFindingDraft | null {
  const located = locatableEdit(args);
  if (!located) return null;
  return {
    section: args.section,
    contentPath: args.contentPath,
    anchorText: located.edit.anchorText,
    message: args.reasoning,
    severity: args.severity ?? (args.kind === "ai_grammar" ? "minor" : "major"),
    kind: "fixable",
    commentId: null,
    metadata: {
      proposedEdit: {
        kind: args.kind,
        anchorText: located.edit.anchorText,
        deleteText: located.edit.deleteText,
        insertText: located.edit.insertText,
      } satisfies ProposedReviewEdit,
    },
  };
}

/**
 * Turn a located finding into an exact Apply when its edit lands on the text.
 * Findings whose edit does not land keep their shape and are drafted on Apply.
 */
export function withProposedEdit(
  ctx: Pick<ReviewRunContext, "sections">,
  finding: ReviewFindingDraft,
  edit: { deleteText: string; insertText: string }
): ReviewFindingDraft {
  if (!finding.section || !finding.contentPath) return finding;
  const proposal = locateProposedEdit({
    ctx,
    section: finding.section,
    contentPath: finding.contentPath,
    edit: { anchorText: finding.anchorText, ...edit },
    reasoning: finding.message,
    kind: "ai_fix",
    severity: finding.severity,
  });
  if (!proposal) return finding;
  return {
    ...finding,
    kind: "fixable",
    metadata: { ...finding.metadata, ...proposal.metadata },
  };
}
