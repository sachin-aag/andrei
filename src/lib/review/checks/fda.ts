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

export function groupFdaCriteriaBySection(
  criteria: FdaCriterion[]
): Map<string, FdaCriterion[]> {
  const groups = new Map<string, FdaCriterion[]>();
  for (const criterion of criteria) {
    const list = groups.get(criterion.targetSection) ?? [];
    list.push(criterion);
    groups.set(criterion.targetSection, list);
  }
  return groups;
}

function stubFdaResults(criteria: FdaCriterion[]) {
  return criteria.map((criterion) => ({
    criterionKey: criterion.key,
    criterionLabel: criterion.label,
    status: "partially_met" as const,
    reasoning: "Stub FDA review (ALLOW_TEST_STUB_REVIEW).",
  }));
}

function missingSectionResult(
  criterion: FdaCriterion
): ReviewCheckResult {
  return {
    findings: [
      {
        section: criterion.targetSection,
        contentPath: null,
        anchorText: "",
        message: `${criterion.label}: target section is not on this report.`,
        severity: "minor",
        kind: "needs_human",
        metadata: { criterionKey: criterion.key },
      },
    ],
  };
}

/** One LLM call per target section, then split findings onto each FDA card. */
export async function runFdaSectionChecks(
  ctx: ReviewRunContext,
  criteria: FdaCriterion[]
): Promise<Map<string, ReviewCheckResult>> {
  const out = new Map<string, ReviewCheckResult>();
  for (const group of groupFdaCriteriaBySection(criteria).values()) {
    const section = group[0]?.targetSection;
    if (!section) continue;
    const sectionRow = ctx.sectionRows.find((row) => row.section === section);
    const content =
      section === "cover_page" ? ctx.report.metadata : ctx.sections[section];
    if (!sectionRow || content === undefined) {
      for (const criterion of group) {
        out.set(fdaCheckId(criterion.key), missingSectionResult(criterion));
      }
      continue;
    }

    const results = isTestStubReview()
      ? stubFdaResults(group)
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
          criteria: group,
          evaluationSystemPrompt: FDA_EVAL_SYSTEM_PROMPT,
          promptVersion: REVIEW_FDA_PROMPT_VERSION,
        });

    const contentHash = evaluationContentHash({
      section,
      content,
      allSections: ctx.sections,
      criteria: group,
      promptVersion: REVIEW_FDA_PROMPT_VERSION,
    });

    const ids = await upsertCriterionEvaluations({
      reportId: ctx.report.id,
      sectionId: sectionRow.id,
      section,
      contentHash,
      results,
    });

    for (const criterion of group) {
      const result = results.find((row) => row.criterionKey === criterion.key);
      out.set(
        fdaCheckId(criterion.key),
        result
          ? findingsForFdaResult({
              ctx,
              section,
              sectionId: sectionRow.id,
              result,
              evaluationId: ids.get(result.criterionKey),
            })
          : { findings: [] }
      );
    }
  }
  return out;
}

export async function runFdaCheck(
  ctx: ReviewRunContext,
  criterion: FdaCriterion
): Promise<ReviewCheckResult> {
  const map = await runFdaSectionChecks(ctx, [criterion]);
  return map.get(fdaCheckId(criterion.key)) ?? { findings: [] };
}

function findingsForFdaResult(args: {
  ctx: ReviewRunContext;
  section: string;
  sectionId: string;
  result: {
    criterionKey: string;
    criterionLabel: string;
    status: ReviewRunContext["evaluations"][number]["status"];
    reasoning: string;
  };
  evaluationId: string | undefined;
}): ReviewCheckResult {
  const evalRow = {
    id: args.evaluationId ?? "",
    reportId: args.ctx.report.id,
    sectionId: args.sectionId,
    section: args.section,
    criterionKey: args.result.criterionKey,
    criterionLabel: args.result.criterionLabel,
    status: args.result.status,
    reasoning: args.result.reasoning,
    bypassed: false,
    evaluatedContentHash: "",
    updatedAt: "",
  };
  if (
    effectiveStatus(evalRow) === "met" ||
    effectiveStatus(evalRow) === "not_evaluated"
  ) {
    return { findings: [] };
  }
  const comment = args.ctx.comments.find(
    (row) =>
      !row.parentId &&
      isAiSuggestionKind(row.kind) &&
      row.status === "open" &&
      row.evaluationId === args.evaluationId
  );
  return {
    findings: [
      {
        section: args.section,
        contentPath: comment?.contentPath ?? null,
        anchorText: comment?.anchorText ?? "",
        message: `${args.result.criterionLabel}: ${args.result.reasoning || args.result.status}`,
        severity: args.result.status === "not_met" ? "critical" : "major",
        kind: comment ? "fixable" : "needs_human",
        commentId: comment?.id ?? null,
        metadata: {
          criterionKey: args.result.criterionKey,
          evaluationId: args.evaluationId,
        },
      },
    ],
  };
}
