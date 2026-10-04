import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  comments,
  criteriaEvaluations,
  documentPages,
  reportAttachments,
  reportSections,
} from "@/db/schema";
import type { DocumentType } from "@/db/schema";
import { mergeSectionForType } from "@/lib/document-types";
import { normalizeCommentRecord } from "@/lib/comments/normalize";
import type { AllSectionsContent } from "@/lib/ai/evaluation-content-hash";
import type { CommentRecord, EvaluationRecord } from "@/types/report";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import type { ReportWithManagers } from "@/lib/reports/require-report-access";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import { checkById } from "./catalog";
import { reviewContentHash } from "./content-hash";
import { fdaCriteriaForDocumentType, type FdaCriterion } from "./fda-criteria";
import { finishReviewRun, latestRunsByCheck, startReviewRun } from "./persist";
import {
  REVIEW_CITATION_PROMPT_VERSION,
  REVIEW_FDA_PROMPT_VERSION,
  REVIEW_WRITING_PROMPT_VERSION,
} from "./prompts";
import { fdaCheckId, groupFdaCriteriaBySection, runFdaSectionChecks } from "./checks/fda";
import type { ReviewCheckId, ReviewCheckResult, ReviewRunContext } from "./types";

const RUN_CONCURRENCY = 3;

function saltForCheck(checkId: string): string {
  if (checkId.startsWith("fda.")) return REVIEW_FDA_PROMPT_VERSION;
  if (checkId.startsWith("citations.")) return REVIEW_CITATION_PROMPT_VERSION;
  if (checkId.startsWith("writing.")) return REVIEW_WRITING_PROMPT_VERSION;
  return "report-v1";
}

export function shouldSkipFreshCheck(args: {
  latest: { status: string; contentHash: string | null } | undefined;
  contentHash: string;
}): boolean {
  return (
    args.latest?.status === "completed" &&
    args.latest.contentHash === args.contentHash
  );
}

type ReviewJob =
  | { kind: "single"; checkId: ReviewCheckId }
  | { kind: "fda-section"; criteria: FdaCriterion[] };

export function reviewRunJobs(args: {
  checkIds: ReviewCheckId[];
  fdaCriteria: FdaCriterion[];
}): ReviewJob[] {
  const requestedFda = new Set(
    args.checkIds.filter((id) => id.startsWith("fda."))
  );
  const singles = args.checkIds
    .filter((id) => !id.startsWith("fda."))
    .map((checkId) => ({ kind: "single" as const, checkId }));
  const selected = args.fdaCriteria.filter((criterion) =>
    requestedFda.has(fdaCheckId(criterion.key))
  );
  const fdaJobs = [...groupFdaCriteriaBySection(selected).values()].map(
    (criteria) => ({ kind: "fda-section" as const, criteria })
  );
  return [...singles, ...fdaJobs];
}

async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const executing: Promise<void>[] = [];
  for (const item of items) {
    const task = Promise.resolve().then(() => fn(item));
    executing.push(task);
    const drop = task.then(() => {
      executing.splice(executing.indexOf(task), 1);
    });
    void drop;
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

export async function loadReviewRunContext(args: {
  report: ReportWithManagers;
  user: WorkspaceUser;
}): Promise<ReviewRunContext> {
  const { report, user } = args;
  const documentType = report.documentType as DocumentType;
  const [sectionRows, evaluationRows, commentRows, attachmentRows] =
    await Promise.all([
      db
        .select()
        .from(reportSections)
        .where(eq(reportSections.reportId, report.id)),
      db
        .select()
        .from(criteriaEvaluations)
        .where(eq(criteriaEvaluations.reportId, report.id)),
      db.select().from(comments).where(eq(comments.reportId, report.id)),
      db
        .select({
          id: reportAttachments.id,
          filename: reportAttachments.filename,
          pageNumber: documentPages.pageNumber,
        })
        .from(reportAttachments)
        .leftJoin(
          documentPages,
          and(
            eq(documentPages.attachmentId, reportAttachments.id),
            eq(documentPages.ingestRunId, reportAttachments.activeIngestRunId)
          )
        )
        .where(
          and(
            eq(reportAttachments.reportId, report.id),
            isNull(reportAttachments.deletedAt)
          )
        ),
    ]);

  const sections: AllSectionsContent = {};
  for (const row of sectionRows) {
    sections[row.section] = mergeSectionForType(
      documentType,
      row.section,
      row.content
    );
  }

  const attachmentByFilename = new Map<string, string>();
  const attachmentPages: Array<{ filename: string; pageNumber: number | null }> =
    [];
  for (const row of attachmentRows) {
    attachmentByFilename.set(row.filename, row.id);
    attachmentPages.push({
      filename: row.filename,
      pageNumber: row.pageNumber ?? null,
    });
  }

  return {
    report,
    user,
    documentType,
    sections,
    sectionRows: sectionRows.map((row) => ({ id: row.id, section: row.section })),
    evaluations: evaluationRows.map((row) => ({
      ...row,
      section: row.section as EvaluationRecord["section"],
      updatedAt: row.updatedAt.toISOString(),
    })),
    comments: commentRows.map(normalizeCommentRecord) as CommentRecord[],
    attachmentFilenames: [...attachmentByFilename.keys()],
    attachmentByFilename,
    attachmentPages,
  };
}

async function persistCheckOutcome(args: {
  ctx: ReviewRunContext;
  checkId: ReviewCheckId;
  result?: ReviewCheckResult;
  error?: string;
}): Promise<"ran" | "failed"> {
  const def = checkById(args.ctx.documentType, args.checkId);
  const contentHash = reviewContentHash(
    args.ctx.sections,
    saltForCheck(args.checkId)
  );
  const runId = await startReviewRun({
    reportId: args.ctx.report.id,
    checkId: args.checkId,
    contentHash,
    createdBy: args.ctx.user.id,
  });
  if (args.error || !args.result) {
    await finishReviewRun({
      runId,
      reportId: args.ctx.report.id,
      checkId: args.checkId,
      findings: [],
      error: args.error ?? "Check failed",
    });
    return "failed";
  }
  await finishReviewRun({
    runId,
    reportId: args.ctx.report.id,
    checkId: args.checkId,
    findings: args.result.findings,
  });
  await recordAuditEvent({
    actor: auditActorFromUser(args.ctx.user),
    action: "review_check_run",
    entityType: "review",
    entityId: runId,
    reportId: args.ctx.report.id,
    summary: `Ran review check ${def?.label ?? args.checkId}`,
    newValue: { checkId: args.checkId, issueCount: args.result.findings.length },
  });
  return "ran";
}

export async function runReviewChecks(args: {
  report: ReportWithManagers;
  user: WorkspaceUser;
  checkIds: ReviewCheckId[];
}): Promise<{ ran: string[]; failed: string[]; skipped: string[] }> {
  const ctx = await loadReviewRunContext(args);
  const latest = await latestRunsByCheck(ctx.report.id);
  const ran: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];

  const pending: ReviewCheckId[] = [];
  for (const checkId of args.checkIds) {
    const def = checkById(ctx.documentType, checkId);
    if (!def || def.kind !== "run" || !def.run) continue;
    const contentHash = reviewContentHash(ctx.sections, saltForCheck(checkId));
    if (shouldSkipFreshCheck({ latest: latest.get(checkId), contentHash })) {
      skipped.push(checkId);
      continue;
    }
    pending.push(checkId);
  }

  const jobs = reviewRunJobs({
    checkIds: pending,
    fdaCriteria: fdaCriteriaForDocumentType(ctx.documentType),
  });

  await mapPool(jobs, RUN_CONCURRENCY, async (job) => {
    if (job.kind === "single") {
      const def = checkById(ctx.documentType, job.checkId);
      if (!def?.run) return;
      try {
        const result = await def.run(ctx);
        const outcome = await persistCheckOutcome({
          ctx,
          checkId: job.checkId,
          result,
        });
        if (outcome === "ran") ran.push(job.checkId);
        else failed.push(job.checkId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Check failed";
        await persistCheckOutcome({
          ctx,
          checkId: job.checkId,
          error: message,
        });
        failed.push(job.checkId);
      }
      return;
    }

    try {
      const results = await runFdaSectionChecks(ctx, job.criteria);
      for (const criterion of job.criteria) {
        const checkId = fdaCheckId(criterion.key);
        const outcome = await persistCheckOutcome({
          ctx,
          checkId,
          result: results.get(checkId) ?? { findings: [] },
        });
        if (outcome === "ran") ran.push(checkId);
        else failed.push(checkId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Check failed";
      for (const criterion of job.criteria) {
        const checkId = fdaCheckId(criterion.key);
        await persistCheckOutcome({ ctx, checkId, error: message });
        failed.push(checkId);
      }
    }
  });

  return { ran, failed, skipped };
}
