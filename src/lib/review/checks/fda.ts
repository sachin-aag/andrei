import { isAiSuggestionKind } from "@/lib/ai/suggestion-gating";
import { evaluateSection, evaluationContentHash } from "@/lib/ai/evaluate";
import { effectiveStatus } from "@/lib/ai/criteria-view";
import { isTestStubReview } from "@/lib/test/ai-bypass";
import type { FdaCriterion } from "../fda-criteria";
import { FDA_EVAL_SYSTEM_PROMPT, REVIEW_FDA_PROMPT_VERSION } from "../prompts";
import { upsertCriterionEvaluations } from "../persist";
import type { ReviewCheckResult, ReviewRunContext } from "../types";

export function fdaCheckId(criterionKey: string): `fda.${string}` {
  return criterionKey.startsWith("fda.")
    ? (criterionKey as `fda.${string}`)
    : `fda.${criterionKey}`;
}

function stubFdaResult(criterion: FdaCriterion) {
  return [
    {
      criterionKey: criterion.key,
      criterionLabel: criterion.label,
      status: "partially_met" as const,
      reasoning: "Stub FDA review (ALLOW_TEST_STUB_REVIEW).",
    },
  ];
}

export async function runFdaCheck(
  ctx: ReviewRunContext,
  criterion: FdaCriterion
): Promise<ReviewCheckResult> {
  const section = criterion.targetSection;
  const sectionRow = ctx.sectionRows.find((row) => row.section === section);
  const content =
    section === "cover_page" ? ctx.report.metadata : ctx.sections[section];
  if (!sectionRow || content === undefined) {
    return {
      findings: [
        {
          section,
          contentPath: null,
          anchorText: "",
          message: `${criterion.label}: target section is not on this report.`,
          severity: "info",
          kind: "needs_human",
          metadata: { criterionKey: criterion.key },
        },
      ],
    };
  }

  const results = isTestStubReview()
    ? stubFdaResult(criterion)
    : await evaluateSection({
        section,
        content,
        reportContext: {
          deviationNo: String(ctx.report.documentNo ?? ""),
          date: ctx.report.date,
        },
        allSections: ctx.sections,
        documentType: ctx.documentType,
        report: ctx.report as never,
        criteria: [criterion],
        evaluationSystemPrompt: FDA_EVAL_SYSTEM_PROMPT,
        promptVersion: REVIEW_FDA_PROMPT_VERSION,
      });

  const contentHash = evaluationContentHash({
    section,
    content,
    allSections: ctx.sections,
    criteria: [criterion],
    promptVersion: REVIEW_FDA_PROMPT_VERSION,
  });

  const ids = await upsertCriterionEvaluations({
    reportId: ctx.report.id,
    sectionId: sectionRow.id,
    section,
    contentHash,
    results,
  });

  const findings = [];
  for (const result of results) {
    const evaluationId = ids.get(result.criterionKey);
    const evalRow = {
      id: evaluationId ?? "",
      reportId: ctx.report.id,
      sectionId: sectionRow.id,
      section,
      criterionKey: result.criterionKey,
      criterionLabel: result.criterionLabel,
      status: result.status,
      reasoning: result.reasoning,
      bypassed: false,
      evaluatedContentHash: contentHash,
      updatedAt: "",
    };
    if (effectiveStatus(evalRow) === "met") continue;
    if (effectiveStatus(evalRow) === "not_evaluated") continue;
    const comment = ctx.comments.find(
      (row) =>
        !row.parentId &&
        isAiSuggestionKind(row.kind) &&
        row.status === "open" &&
        row.evaluationId === evaluationId
    );
    findings.push({
      section,
      contentPath: comment?.contentPath ?? null,
      anchorText: comment?.anchorText ?? "",
      message: `${result.criterionLabel}: ${result.reasoning || result.status}`,
      severity: result.status === "not_met" ? ("error" as const) : ("warning" as const),
      kind: comment ? ("fixable" as const) : ("needs_human" as const),
      commentId: comment?.id ?? null,
      metadata: { criterionKey: result.criterionKey, evaluationId },
    });
  }
  return { findings };
}
