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
          severity: "info",
          kind: "needs_human",
        },
      ],
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

  const contentHash = evaluationContentHash({
    section,
    content,
    allSections: ctx.sections,
    criteria,
    promptVersion: def.prompts.promptVersion,
  });

  const ids = await upsertCriterionEvaluations({
    reportId: ctx.report.id,
    sectionId: sectionRow.id,
    section,
    contentHash,
    results,
  });

  const openFixes = ctx.comments.filter(
    (comment) =>
      !comment.parentId &&
      isAiSuggestionKind(comment.kind) &&
      comment.status === "open" &&
      comment.section === section
  );

  const findings = [];
  for (const result of results) {
    if (result.criterionKey.startsWith("fda.")) continue;
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
    const comment = openFixes.find((row) => row.evaluationId === evaluationId);
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
