import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";
import { langfuseGenerateTextTelemetry } from "@/lib/observability/langfuse";
import { assertAiBudgetAvailable, recordAiUsage } from "@/lib/ai/usage";
import { CRITERIA_EVAL_GOOGLE_MODEL_ID } from "@/lib/ai/evaluate";
import { isTestStubReview } from "@/lib/test/ai-bypass";
import { persistLocatedEdit } from "../persist-suggestion";
import { iterReportFields } from "../fields";
import { REVIEW_WRITING_PROMPT_VERSION } from "../prompts";
import type { ReviewCheckResult, ReviewFindingDraft, ReviewRunContext } from "../types";

const editSchema = z.object({
  edits: z.array(
    z.object({
      section: z.string(),
      contentPath: z.string(),
      anchorText: z.string(),
      deleteText: z.string(),
      insertText: z.string(),
      message: z.string().min(1).max(400),
    })
  ),
});

async function runWritingLlmCheck(
  ctx: ReviewRunContext,
  args: {
    functionId: string;
    system: string;
    kind: "ai_grammar";
  }
): Promise<ReviewCheckResult> {
  if (isTestStubReview()) {
    return {
      findings: [
        {
          section: null,
          contentPath: null,
          anchorText: "",
          message: "Stub writing review (ALLOW_TEST_STUB_REVIEW).",
          severity: "info",
          kind: "needs_human",
        },
      ],
    };
  }

  const fields = iterReportFields(ctx.documentType, ctx.sections).slice(0, 24);
  if (fields.length === 0) return { findings: [] };

  const prompt = fields
    .map(
      (field) =>
        `SECTION ${field.section} FIELD ${field.contentPath}:\n${field.text.slice(0, 4000)}`
    )
    .join("\n\n");

  const model = resolveGoogleLanguageModel(CRITERIA_EVAL_GOOGLE_MODEL_ID, {
    vertexLocation: "global",
  });
  await assertAiBudgetAvailable();
  const result = await generateText({
    model,
    output: Output.object({ schema: editSchema }),
    system: args.system,
    prompt: `${prompt}\n\nReturn locatable span edits (anchorText unique in that field). Skip citations, placeholders, and table structure.`,
    ...langfuseGenerateTextTelemetry({
      functionId: args.functionId,
      metadata: {
        feature: "review-check",
        promptVersion: REVIEW_WRITING_PROMPT_VERSION,
      },
    }),
  });
  await recordAiUsage({
    feature: "review_check",
    modelId: CRITERIA_EVAL_GOOGLE_MODEL_ID,
    usage: result.usage,
    reportId: ctx.report.id,
  });

  const findings: ReviewFindingDraft[] = [];
  for (const edit of result.experimental_output?.edits ?? []) {
    const finding = await persistLocatedEdit({
      ctx,
      section: edit.section,
      contentPath: edit.contentPath,
      edit: {
        anchorText: edit.anchorText,
        deleteText: edit.deleteText,
        insertText: edit.insertText,
      },
      reasoning: edit.message,
      kind: args.kind,
    });
    if (finding) {
      findings.push(finding);
    } else {
      findings.push({
        section: edit.section,
        contentPath: edit.contentPath,
        anchorText: edit.anchorText,
        message: edit.message,
        severity: "warning",
        kind: "needs_human",
      });
    }
  }
  return { findings };
}

export function runGrammarCheck(ctx: ReviewRunContext): Promise<ReviewCheckResult> {
  return runWritingLlmCheck(ctx, {
    functionId: "review-writing-grammar",
    kind: "ai_grammar",
    system:
      "You are a GxP technical editor. Propose grammar and spelling fixes only. Do not change meaning, citations, placeholders, or table structure.",
  });
}

export function runTenseCheck(ctx: ReviewRunContext): Promise<ReviewCheckResult> {
  return runWritingLlmCheck(ctx, {
    functionId: "review-writing-tense",
    kind: "ai_grammar",
    system:
      "You are a GxP technical editor. Flag executed work that is not in past tense, and inconsistent voice. Propose the smallest locatable edit. Do not change citations, placeholders, or table structure.",
  });
}
