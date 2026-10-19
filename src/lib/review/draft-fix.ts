import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";
import { langfuseGenerateTextTelemetry } from "@/lib/observability/langfuse";
import { assertAiBudgetAvailable, recordAiUsage } from "@/lib/ai/usage";
import { CRITERIA_EVAL_GOOGLE_MODEL_ID } from "@/lib/ai/evaluate";
import {
  readDocumentPage,
  searchReportDocuments,
} from "@/lib/attachments/retrieval";
import { isTestStubReview } from "@/lib/test/ai-bypass";
import type { SuggestionEdit } from "@/lib/suggestions/locator";
import { iterReportFields } from "./fields";
import { findReviewLocateSpan } from "./locate";
import { locateProposedEdit } from "./locate-proposed-edit";
import { REVIEW_DRAFT_FIX_PROMPT_VERSION } from "./prompts";
import { proposedEditFromMetadata, type ProposedReviewEdit } from "./proposed-edit";
import type { ReviewRunContext } from "./types";

export const REVIEW_DRAFT_FIX_SYSTEM_PROMPT = `You fix one review finding in a pharmaceutical quality report with the smallest possible edit.
Return one span edit inside FIELD:
- anchorText is copied character-for-character from FIELD and appears exactly once in it. Extend it with neighbouring words until it is unique.
- deleteText is the exact words inside anchorText to replace. It is never empty: to add words, include the neighbouring word in deleteText and repeat it in insertText.
- insertText replaces deleteText.
Rules:
- Never invent facts, numbers, dates, IDs, or sources.
- Cite only pages listed under EVIDENCE, written exactly as [filename, p. N], and only when that page states the fact.
- When the right value or source is unknown, insert a short fill-in placeholder in angle brackets (for example <citation> or <table number>) instead of guessing.
- Leave citations, placeholders, and table structure you are not fixing unchanged.`;

const draftSchema = z.object({
  anchorText: z.string(),
  deleteText: z.string(),
  insertText: z.string(),
  reasoning: z.string().max(400),
});

export type ReviewFindingToDraft = {
  checkId: string;
  section: string;
  contentPath: string;
  anchorText: string;
  message: string;
  severity: string;
  metadata: Record<string, unknown>;
};

type Evidence = { filename: string; pageNumber: number; text: string };

const EVIDENCE_PAGES = 3;
const EVIDENCE_CHARS = 1500;
const CLAIM_WINDOW = 240;

function focusText(finding: ReviewFindingToDraft): string {
  const focus = finding.metadata.focusText;
  return typeof focus === "string" && focus.trim() ? focus : finding.anchorText;
}

/** The text around the finding, so retrieval searches for the claim, not the marker. */
export function claimAround(fieldText: string, finding: ReviewFindingToDraft): string {
  const span = findReviewLocateSpan(fieldText, {
    anchor: finding.anchorText,
    needle: focusText(finding),
    ...(typeof finding.metadata.focusOccurrence === "number"
      ? { occurrence: finding.metadata.focusOccurrence }
      : {}),
  });
  if (!span) return finding.anchorText || finding.message;
  return fieldText
    .slice(Math.max(0, span.start - CLAIM_WINDOW), span.end + CLAIM_WINDOW)
    .trim();
}

async function evidenceFor(
  ctx: Pick<ReviewRunContext, "report">,
  query: string
): Promise<Evidence[]> {
  try {
    const hits = await searchReportDocuments({
      reportId: ctx.report.id,
      query,
      limit: EVIDENCE_PAGES,
    });
    const pages = await Promise.all(
      hits.map(async (hit) => {
        const read = await readDocumentPage({
          reportId: ctx.report.id,
          attachmentId: hit.attachmentId,
          pageNumber: hit.pageNumber,
        });
        const text = [read?.transcript, read?.visualInterpretation]
          .filter(Boolean)
          .join("\n")
          .slice(0, EVIDENCE_CHARS);
        return text.trim()
          ? { filename: hit.filename, pageNumber: hit.pageNumber, text }
          : null;
      })
    );
    return pages.filter((page): page is Evidence => page != null);
  } catch {
    return [];
  }
}

export function buildDraftFixPrompt(args: {
  finding: ReviewFindingToDraft;
  fieldText: string;
  evidence: Evidence[];
  retryNote?: string;
}): string {
  const { finding } = args;
  const suggested =
    typeof finding.metadata.suggestedText === "string"
      ? finding.metadata.suggestedText.trim()
      : "";
  const parts = [
    `FINDING (${finding.checkId}): ${finding.message}`,
    `TARGET TEXT: ${focusText(finding) || "(none given)"}`,
    suggested ? `SUGGESTED WORDING: ${suggested}` : null,
    `FIELD:\n${args.fieldText.slice(0, 6000)}`,
    args.evidence.length > 0
      ? `EVIDENCE:\n${args.evidence
          .map((page) => `[${page.filename}, p. ${page.pageNumber}]\n${page.text}`)
          .join("\n\n---\n\n")}`
      : "EVIDENCE: none",
    args.retryNote ?? null,
  ];
  return parts.filter((part): part is string => Boolean(part)).join("\n\n");
}

/** Deterministic stand-in for tests: flag the target with a placeholder. */
export function stubDraftEdit(
  fieldText: string,
  finding: ReviewFindingToDraft
): SuggestionEdit | null {
  const target = focusText(finding);
  if (!target.trim()) return null;
  const anchor = finding.anchorText.includes(target) ? finding.anchorText : target;
  if (!fieldText.includes(anchor)) return null;
  return { anchorText: anchor, deleteText: target, insertText: `${target} <verify>` };
}

async function modelDraft(
  ctx: Pick<ReviewRunContext, "report">,
  prompt: string
): Promise<z.infer<typeof draftSchema> | null> {
  const model = resolveGoogleLanguageModel(CRITERIA_EVAL_GOOGLE_MODEL_ID, {
    vertexLocation: "global",
  });
  await assertAiBudgetAvailable();
  const result = await generateText({
    model,
    output: Output.object({ schema: draftSchema }),
    system: REVIEW_DRAFT_FIX_SYSTEM_PROMPT,
    prompt,
    ...langfuseGenerateTextTelemetry({
      functionId: "review-draft-fix",
      metadata: {
        feature: "review-check",
        promptVersion: REVIEW_DRAFT_FIX_PROMPT_VERSION,
      },
    }),
  });
  await recordAiUsage({
    feature: "review_check",
    modelId: CRITERIA_EVAL_GOOGLE_MODEL_ID,
    usage: result.usage,
    reportId: ctx.report.id,
  });
  return result.experimental_output ?? null;
}

/**
 * Drafts one exact edit for a finding no check could fix on its own. Runs
 * while checks run, so Apply only has to place it. Null when no draft lands
 * on the text.
 */
export async function draftEditForFinding(args: {
  ctx: Pick<ReviewRunContext, "documentType" | "sections" | "report">;
  finding: ReviewFindingToDraft;
}): Promise<ProposedReviewEdit | null> {
  const { ctx, finding } = args;
  const field = iterReportFields(ctx.documentType, ctx.sections).find(
    (row) =>
      row.section === finding.section && row.contentPath === finding.contentPath
  );
  if (!field) return null;

  const locate = (edit: SuggestionEdit): ProposedReviewEdit | null =>
    proposedEditFromMetadata(
      locateProposedEdit({
        ctx,
        section: finding.section,
        contentPath: finding.contentPath,
        edit,
        reasoning: finding.message,
        kind: "ai_fix",
      })?.metadata
    );

  if (isTestStubReview()) {
    const edit = stubDraftEdit(field.text, finding);
    return edit ? locate(edit) : null;
  }

  const evidence = finding.checkId.startsWith("citations.")
    ? await evidenceFor(ctx, claimAround(field.text, finding))
    : [];

  let retryNote: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const draft = await modelDraft(
      ctx,
      buildDraftFixPrompt({ finding, fieldText: field.text, evidence, retryNote })
    );
    if (!draft || !draft.deleteText.trim()) return null;
    const located = locate({
      anchorText: draft.anchorText,
      deleteText: draft.deleteText,
      insertText: draft.insertText,
    });
    if (located) return located;
    retryNote = `Your previous anchorText "${draft.anchorText}" was not found exactly once in FIELD, or deleteText was not inside it. Copy both character-for-character from FIELD.`;
  }
  return null;
}
