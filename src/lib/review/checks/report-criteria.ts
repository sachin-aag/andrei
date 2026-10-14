import { isAiSuggestionKind } from "@/lib/ai/suggestion-gating";
import { evaluateSection, evaluationContentHash } from "@/lib/ai/evaluate";
import { getCriteria, getDocumentType } from "@/lib/document-types";
import { effectiveStatus } from "@/lib/ai/criteria-view";
import { upsertCriterionEvaluations } from "../persist";
import type { ReviewCheckResult, ReviewRunContext } from "../types";

export function reportCriteriaCheckId(section: string): `report.criteria.${string}` {
  return `report.criteria.${section}`;
}

export function sectionFromReportCriteriaCheckId(checkId: string): string | null {
  const prefix = "report.criteria.";
  if (!checkId.startsWith(prefix)) return null;
  const section = checkId.slice(prefix.length);
  return section || null;
}

export function sectionEvaluationsAreFresh(args: {
  section: string;
  criteria: Array<{ key: string }>;
  evaluations: ReviewRunContext["evaluations"];
  contentHash: string;
}): boolean {
  if (args.criteria.length === 0) return false;
  const byKey = new Map(
    args.evaluations
      .filter(
        (row) =>
          row.section === args.section && !row.criterionKey.startsWith("fda.")
      )
      .map((row) => [row.criterionKey, row])
  );
  return args.criteria.every((criterion) => {
    const row = byKey.get(criterion.key);
    return row?.evaluatedContentHash === args.contentHash;
  });
}

export async function runReportCriteriaCheck(
  ctx: ReviewRunContext,
  section: string
): Promise<ReviewCheckResult> {
  const def = getDocumentType(ctx.documentType);
  const criteria = getCriteria(ctx.documentType, section);
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
          message: "This section is not available to evaluate on this report.",
          severity: "minor",
          kind: "needs_human",
        },
      ],
    };
  }

  const contentHash = evaluationContentHash({
    section,
    content,
    allSections: ctx.sections,
    criteria,
    promptVersion: def.prompts.promptVersion,
  });

  if (
    sectionEvaluationsAreFresh({
      section,
      criteria,
      evaluations: ctx.evaluations,
      contentHash,
    })
  ) {
    const ids = new Map(
      ctx.evaluations
        .filter((row) => row.section === section)
        .map((row) => [row.criterionKey, row.id])
    );
    return {
      findings: findingsFromCriteriaResults({
        ctx,
        section,
        sectionId: sectionRow.id,
        results: ctx.evaluations
          .filter(
            (row) =>
              row.section === section &&
              criteria.some((criterion) => criterion.key === row.criterionKey)
          )
          .map((row) => ({
            criterionKey: row.criterionKey,
            criterionLabel: row.criterionLabel,
            status: row.status,
            reasoning: row.reasoning,
          })),
        ids,
      }),
    };
  }

  const results = await evaluateSection({
    section,
    content,
    reportContext: {
      deviationNo: String(ctx.report.documentNo ?? ""),
      date: ctx.report.date,
    },
    allSections: ctx.sections,
    documentType: ctx.documentType,
    report: ctx.report as never,
  });

  const ids = await upsertCriterionEvaluations({
    reportId: ctx.report.id,
    sectionId: sectionRow.id,
    section,
    contentHash,
    results,
  });

  return {
    findings: findingsFromCriteriaResults({
      ctx,
      section,
      sectionId: sectionRow.id,
      results,
      ids,
    }),
  };
}

function findingsFromCriteriaResults(args: {
  ctx: ReviewRunContext;
  section: string;
  sectionId: string;
  results: Array<{
    criterionKey: string;
    criterionLabel: string;
    status: ReviewRunContext["evaluations"][number]["status"];
    reasoning: string;
  }>;
  ids: Map<string, string>;
}): ReviewCheckResult["findings"] {
  const openFixes = args.ctx.comments.filter(
    (comment) =>
      !comment.parentId &&
      isAiSuggestionKind(comment.kind) &&
      comment.status === "open" &&
      comment.section === args.section
  );

  const findings: ReviewCheckResult["findings"] = [];
  for (const result of args.results) {
    if (result.criterionKey.startsWith("fda.")) continue;
    const evaluationId = args.ids.get(result.criterionKey);
    const evalRow = {
      id: evaluationId ?? "",
      reportId: args.ctx.report.id,
      sectionId: args.sectionId,
      section: args.section,
      criterionKey: result.criterionKey,
      criterionLabel: result.criterionLabel,
      status: result.status,
      reasoning: result.reasoning,
      bypassed: false,
      evaluatedContentHash: "",
      updatedAt: "",
    };
    if (effectiveStatus(evalRow) === "met") continue;
    if (effectiveStatus(evalRow) === "not_evaluated") continue;
    const comment = openFixes.find((row) => row.evaluationId === evaluationId);
    findings.push({
      section: args.section,
      contentPath: comment?.contentPath ?? null,
      anchorText: comment?.anchorText ?? "",
      message: `${result.criterionLabel}: ${result.reasoning || result.status}`,
      severity: result.status === "not_met" ? ("critical" as const) : ("major" as const),
      kind: comment ? ("fixable" as const) : ("needs_human" as const),
      commentId: comment?.id ?? null,
      metadata: { criterionKey: result.criterionKey, evaluationId },
    });
  }
  return findings;
}
