import { and, desc, eq, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import {
  criteriaEvaluations,
  reviewCheckRuns,
  reviewFindings,
} from "@/db/schema";
import type { CriterionEvaluationResult } from "@/lib/ai/evaluate";
import type { ReviewFindingDraft } from "./types";

export async function startReviewRun(args: {
  reportId: string;
  checkId: string;
  contentHash: string;
  createdBy: string;
}): Promise<string> {
  const id = createId();
  await db.insert(reviewCheckRuns).values({
    id,
    reportId: args.reportId,
    checkId: args.checkId,
    status: "running",
    contentHash: args.contentHash,
    createdBy: args.createdBy,
  });
  return id;
}

export async function finishReviewRun(args: {
  runId: string;
  reportId: string;
  checkId: string;
  findings: ReviewFindingDraft[];
  error?: string;
}): Promise<void> {
  const finishedAt = new Date();
  if (args.error) {
    await db
      .update(reviewCheckRuns)
      .set({
        status: "failed",
        error: args.error,
        finishedAt,
        issueCount: 0,
      })
      .where(eq(reviewCheckRuns.id, args.runId));
    return;
  }

  const previousOpen = await db
    .select({ id: reviewFindings.id })
    .from(reviewFindings)
    .where(
      and(
        eq(reviewFindings.reportId, args.reportId),
        eq(reviewFindings.checkId, args.checkId),
        eq(reviewFindings.status, "open")
      )
    );
  if (previousOpen.length > 0) {
    await db
      .update(reviewFindings)
      .set({ status: "resolved" })
      .where(
        inArray(
          reviewFindings.id,
          previousOpen.map((row) => row.id)
        )
      );
  }

  if (args.findings.length > 0) {
    await db.insert(reviewFindings).values(
      args.findings.map((finding) => ({
        reportId: args.reportId,
        checkId: args.checkId,
        runId: args.runId,
        section: finding.section,
        contentPath: finding.contentPath,
        anchorText: finding.anchorText,
        message: finding.message,
        severity: finding.severity,
        kind: finding.kind,
        commentId: finding.commentId ?? null,
        metadata: finding.metadata ?? {},
      }))
    );
  }

  await db
    .update(reviewCheckRuns)
    .set({
      status: "completed",
      finishedAt,
      issueCount: args.findings.length,
      error: null,
    })
    .where(eq(reviewCheckRuns.id, args.runId));
}

export async function latestRunsByCheck(reportId: string) {
  const rows = await db
    .select()
    .from(reviewCheckRuns)
    .where(eq(reviewCheckRuns.reportId, reportId))
    .orderBy(desc(reviewCheckRuns.startedAt));
  const byCheck = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!byCheck.has(row.checkId)) byCheck.set(row.checkId, row);
  }
  return byCheck;
}

export async function openFindingsForReport(reportId: string) {
  return db
    .select()
    .from(reviewFindings)
    .where(
      and(
        eq(reviewFindings.reportId, reportId),
        eq(reviewFindings.status, "open")
      )
    );
}

export async function upsertCriterionEvaluations(args: {
  reportId: string;
  sectionId: string;
  section: string;
  contentHash: string;
  results: CriterionEvaluationResult[];
}): Promise<Map<string, string>> {
  const existing = await db
    .select()
    .from(criteriaEvaluations)
    .where(eq(criteriaEvaluations.sectionId, args.sectionId));
  const existingByKey = new Map(existing.map((row) => [row.criterionKey, row]));
  const ids = new Map<string, string>();

  for (const result of args.results) {
    const prior = existingByKey.get(result.criterionKey);
    if (prior) {
      const keepBypass = prior.bypassed && result.status !== "met";
      await db
        .update(criteriaEvaluations)
        .set({
          section: args.section,
          status: result.status,
          criterionLabel: result.criterionLabel,
          reasoning: result.reasoning,
          bypassed: keepBypass,
          evaluatedContentHash: args.contentHash,
          updatedAt: new Date(),
        })
        .where(eq(criteriaEvaluations.id, prior.id));
      ids.set(result.criterionKey, prior.id);
    } else {
      const id = createId();
      await db.insert(criteriaEvaluations).values({
        id,
        reportId: args.reportId,
        sectionId: args.sectionId,
        section: args.section,
        criterionKey: result.criterionKey,
        criterionLabel: result.criterionLabel,
        status: result.status,
        reasoning: result.reasoning,
        evaluatedContentHash: args.contentHash,
      });
      ids.set(result.criterionKey, id);
    }
  }
  return ids;
}
