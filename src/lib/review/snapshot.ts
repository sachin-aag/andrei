import { collectPlaceholders } from "@/lib/placeholders/scan-sections";
import type { SectionContentMap } from "@/types/sections";
import type { CommentRecord, EvaluationRecord } from "@/types/report";
import { effectiveStatus } from "@/lib/ai/criteria-view";
import { checksForDocumentType } from "./catalog";
import { sectionFromReportCriteriaCheckId } from "./checks/report-criteria";
import { reviewContentHash } from "./content-hash";
import { latestRunsByCheck, openFindingsForReport } from "./persist";
import {
  REVIEW_CITATION_PROMPT_VERSION,
  REVIEW_FDA_PROMPT_VERSION,
  REVIEW_WRITING_PROMPT_VERSION,
} from "./prompts";
import type {
  ReviewCheckDto,
  ReviewCheckUiStatus,
  ReviewFindingDto,
  ReviewRunContext,
} from "./types";
import { categoryLabel } from "./types";

export type { ReviewCheckDto, ReviewFindingDto };

function saltForCheck(checkId: string): string {
  if (checkId.startsWith("fda.")) return REVIEW_FDA_PROMPT_VERSION;
  if (checkId.startsWith("citations.")) return REVIEW_CITATION_PROMPT_VERSION;
  if (checkId.startsWith("writing.")) return REVIEW_WRITING_PROMPT_VERSION;
  return "report-v1";
}

/** Overlay live failing criteria onto a never-run Report card. */
export function liveCriteriaFindings(args: {
  checkId: string;
  section: string;
  evaluations: EvaluationRecord[];
  comments: CommentRecord[];
}): ReviewFindingDto[] {
  const failing = args.evaluations.filter((row) => {
    if (row.section !== args.section || row.criterionKey.startsWith("fda.")) {
      return false;
    }
    const statusNow = effectiveStatus(row);
    return statusNow !== "met" && statusNow !== "not_evaluated";
  });
  return failing.map((row) => {
    const comment = args.comments.find(
      (item) =>
        item.evaluationId === row.id && item.status === "open" && !item.parentId
    );
    return {
      id: `live:${row.id}`,
      checkId: args.checkId,
      section: row.section,
      contentPath: comment?.contentPath ?? null,
      anchorText: comment?.anchorText ?? "",
      message: `${row.criterionLabel}: ${row.reasoning || row.status}`,
      severity: row.status === "not_met" ? "error" : "warning",
      kind: comment ? "fixable" : "needs_human",
      commentId: comment?.id ?? null,
      status: "open",
      metadata: { criterionKey: row.criterionKey, evaluationId: row.id },
    };
  });
}

export async function buildReviewSnapshot(ctx: ReviewRunContext): Promise<{
  checks: ReviewCheckDto[];
  findings: ReviewFindingDto[];
  placeholderCount: number;
}> {
  const defs = checksForDocumentType(ctx.documentType);
  const [runs, openFindings] = await Promise.all([
    latestRunsByCheck(ctx.report.id),
    openFindingsForReport(ctx.report.id),
  ]);
  const knownCheckIds = new Set(defs.map((def) => def.id));
  const catalogFindings = openFindings.filter((row) =>
    knownCheckIds.has(row.checkId)
  );
  const findingsByCheck = new Map<string, number>();
  for (const finding of catalogFindings) {
    findingsByCheck.set(
      finding.checkId,
      (findingsByCheck.get(finding.checkId) ?? 0) + 1
    );
  }

  const placeholderCount = collectPlaceholders(
    ctx.sections as Partial<SectionContentMap>
  ).length;

  const findings: ReviewFindingDto[] = catalogFindings.map((row) => ({
    id: row.id,
    checkId: row.checkId,
    section: row.section,
    contentPath: row.contentPath,
    anchorText: row.anchorText,
    message: row.message,
    severity: row.severity,
    kind: row.kind,
    commentId: row.commentId,
    status: row.status,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  }));

  const checks: ReviewCheckDto[] = defs.map((def) => {
    if (def.kind === "live") {
      return {
        id: def.id,
        category: def.category,
        categoryLabel: categoryLabel(def.category),
        label: def.label,
        description: def.description,
        standardTag: def.standardTag,
        kind: def.kind,
        status: placeholderCount > 0 ? "issues" : "clean",
        issueCount: placeholderCount,
        lastRunAt: null,
        error: null,
      };
    }
    const run = runs.get(def.id);
    const currentHash = reviewContentHash(ctx.sections, saltForCheck(def.id));
    let status: ReviewCheckUiStatus = "never_run";
    let issueCount = findingsByCheck.get(def.id) ?? 0;
    if (run?.status === "running") status = "running";
    else if (run?.status === "failed") status = "failed";
    else if (run?.status === "completed") {
      if (run.contentHash !== currentHash) status = "out_of_date";
      else status = issueCount > 0 ? "issues" : "clean";
    }

    const section = sectionFromReportCriteriaCheckId(def.id);
    if (section && !run) {
      const live = liveCriteriaFindings({
        checkId: def.id,
        section,
        evaluations: ctx.evaluations,
        comments: ctx.comments,
      });
      if (live.length > 0) {
        issueCount = live.length;
        status = "issues";
        findings.push(...live);
      }
    }

    return {
      id: def.id,
      category: def.category,
      categoryLabel: categoryLabel(def.category),
      label: def.label,
      description: def.description,
      standardTag: def.standardTag,
      kind: def.kind,
      status,
      issueCount,
      lastRunAt: run?.finishedAt?.toISOString() ?? run?.startedAt.toISOString() ?? null,
      error: run?.error ?? null,
    };
  });

  return {
    checks,
    findings,
    placeholderCount,
  };
}
