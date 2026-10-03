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
import { finishReviewRun, startReviewRun } from "./persist";
import {
  REVIEW_CITATION_PROMPT_VERSION,
  REVIEW_FDA_PROMPT_VERSION,
  REVIEW_WRITING_PROMPT_VERSION,
} from "./prompts";
import type { ReviewCheckId, ReviewRunContext } from "./types";

const RUN_CONCURRENCY = 3;

function saltForCheck(checkId: string): string {
  if (checkId.startsWith("fda.")) return REVIEW_FDA_PROMPT_VERSION;
  if (checkId.startsWith("citations.")) return REVIEW_CITATION_PROMPT_VERSION;
  if (checkId.startsWith("writing.")) return REVIEW_WRITING_PROMPT_VERSION;
  return "report-v1";
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

export async function runReviewChecks(args: {
  report: ReportWithManagers;
  user: WorkspaceUser;
  checkIds: ReviewCheckId[];
}): Promise<{ ran: string[]; failed: string[] }> {
  const ctx = await loadReviewRunContext(args);
  const ran: string[] = [];
  const failed: string[] = [];

  await mapPool(args.checkIds, RUN_CONCURRENCY, async (checkId) => {
    const def = checkById(ctx.documentType, checkId);
    if (!def || def.kind !== "run" || !def.run) return;
    const contentHash = reviewContentHash(ctx.sections, saltForCheck(checkId));
    const runId = await startReviewRun({
      reportId: ctx.report.id,
      checkId,
      contentHash,
      createdBy: ctx.user.id,
    });
    try {
      const result = await def.run(ctx);
      await finishReviewRun({
        runId,
        reportId: ctx.report.id,
        checkId,
        findings: result.findings,
      });
      await recordAuditEvent({
        actor: auditActorFromUser(ctx.user),
        action: "review_check_run",
        entityType: "review",
        entityId: runId,
        reportId: ctx.report.id,
        summary: `Ran review check ${def.label}`,
        newValue: { checkId, issueCount: result.findings.length },
      });
      ran.push(checkId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Check failed";
      await finishReviewRun({
        runId,
        reportId: ctx.report.id,
        checkId,
        findings: [],
        error: message,
      });
      failed.push(checkId);
    }
  });

  return { ran, failed };
}
