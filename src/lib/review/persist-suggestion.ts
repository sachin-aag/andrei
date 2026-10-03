import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import { comments } from "@/db/schema";
import { AI_AUTHOR_ID } from "@/lib/ai/constants";
import {
  serializeAiFixCommentContent,
  type ParsedAiFixPayload,
} from "@/lib/ai/suggestion-gating";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import {
  isApplyableStatus,
  probePlainEdit,
  probeRichEdit,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import {
  buildSuggestionRecord,
  withSuggestionRecord,
} from "@/lib/suggestions/suggestion-record";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import type { ReviewFindingDraft } from "./types";
import type { ReviewRunContext } from "./types";

export async function persistLocatedEdit(args: {
  ctx: ReviewRunContext;
  section: string;
  contentPath: string;
  edit: SuggestionEdit;
  reasoning: string;
  kind: "ai_fix" | "ai_grammar";
}): Promise<ReviewFindingDraft | null> {
  const { ctx, section, contentPath, reasoning, kind } = args;
  const insertText = normalizeSuggestionInsertText(args.edit.insertText);
  const edit: SuggestionEdit = { ...args.edit, insertText };
  const content = ctx.sections[section];
  if (!content || typeof content !== "object") return null;
  const record = content as Record<string, unknown>;
  const sectionRow = ctx.sectionRows.find((row) => row.section === section);
  if (!sectionRow) return null;

  if (isRichTargetField(section, contentPath)) {
    const doc = getRichFieldValue(record, contentPath);
    if (!isApplyableStatus(probeRichEdit(doc, edit))) return null;
  } else {
    const plain = getPlainTextFieldValue(record, contentPath);
    if (!isApplyableStatus(probePlainEdit(plain, edit))) return null;
  }

  const payload: ParsedAiFixPayload = withSuggestionRecord(
    {
      deleteText: edit.deleteText,
      insertText,
      reasoning,
      second: edit.second,
    },
    buildSuggestionRecord({
      sectionContent: record,
      section,
      targetField: contentPath,
      documentType: ctx.documentType,
      input: {
        kind: "located",
        edit: {
          anchorText: edit.anchorText,
          deleteText: edit.deleteText,
          insertText,
          second: edit.second,
        },
      },
    })
  );

  const commentId = createId();
  await db.insert(comments).values({
    id: commentId,
    reportId: ctx.report.id,
    sectionId: sectionRow.id,
    section,
    authorId: AI_AUTHOR_ID,
    content: serializeAiFixCommentContent(payload),
    anchorText: edit.anchorText,
    contentPath,
    fromPos: null,
    toPos: null,
    status: "open",
    kind,
  });

  return {
    section,
    contentPath,
    anchorText: edit.anchorText,
    message: reasoning,
    severity: "warning",
    kind: "fixable",
    commentId,
  };
}
