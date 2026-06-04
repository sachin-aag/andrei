import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  criteriaEvaluations,
  reportSections,
  reports,
  type SectionType,
} from "@/db/schema";
import {
  evaluateSection,
  type AllSectionsContent,
} from "@/lib/ai/evaluate";
import { EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";
import { normalizeAnalyzeToolResults } from "@/lib/ai/evaluate-run-helpers";
import { hashContent } from "@/lib/ai/content-hash";
import { cleanSectionContentForEval } from "@/lib/tiptap/strip-pending-suggestions";
import { PROMPT_VERSION } from "@/lib/ai/section-prompts";
import {
  hasEnoughContextInFirstSection,
  INSUFFICIENT_FIRST_SECTION_MESSAGE,
} from "@/lib/ai/first-section-context";

export class ImproveAiEvaluationError extends Error {
  constructor(
    message: string,
    readonly status: number = 400
  ) {
    super(message);
    this.name = "ImproveAiEvaluationError";
  }
}

export type ReportEvaluationRow = typeof criteriaEvaluations.$inferSelect;

/**
 * Runs AI criteria evaluation for all DMAIC sections on a report and upserts
 * `criteria_evaluations` rows (same behavior as POST /api/reports/[id]/evaluate).
 */
export async function evaluateReportCriteria(
  reportId: string
): Promise<ReportEvaluationRow[]> {
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) {
    throw new ImproveAiEvaluationError("Report not found", 404);
  }

  const targetSections: SectionType[] = [...EVALUATABLE_SECTIONS];

  const sectionRows = await db
    .select()
    .from(reportSections)
    .where(
      and(
        eq(reportSections.reportId, reportId),
        inArray(reportSections.section, targetSections)
      )
    );

  const allEvaluatableRows = await db
    .select()
    .from(reportSections)
    .where(
      and(
        eq(reportSections.reportId, reportId),
        inArray(reportSections.section, EVALUATABLE_SECTIONS)
      )
    );

  const bySection = new Map<SectionType, (typeof allEvaluatableRows)[number]>();
  for (const row of allEvaluatableRows) bySection.set(row.section, row);

  const defineRow = bySection.get("define");
  if (!hasEnoughContextInFirstSection(defineRow?.content)) {
    throw new ImproveAiEvaluationError(INSUFFICIENT_FIRST_SECTION_MESSAGE, 400);
  }

  const existingForSections = sectionRows.length
    ? await db
        .select()
        .from(criteriaEvaluations)
        .where(
          inArray(
            criteriaEvaluations.sectionId,
            sectionRows.map((r) => r.id)
          )
        )
    : [];
  const existingBySectionId = new Map<string, typeof existingForSections>();
  for (const row of existingForSections) {
    const arr = existingBySectionId.get(row.sectionId) ?? [];
    arr.push(row);
    existingBySectionId.set(row.sectionId, arr);
  }

  const allSections: AllSectionsContent = {};
  for (const row of allEvaluatableRows) {
    allSections[row.section] = row.content;
  }

  const llmResults = await Promise.all(
    sectionRows.map(async (row) => {
      const evaluations = await evaluateSection({
        section: row.section,
        content: row.content,
        reportContext: { deviationNo: report.deviationNo, date: report.date },
        allSections,
      });
      return {
        sectionRow: row,
        evaluations:
          row.section === "analyze"
            ? normalizeAnalyzeToolResults(row.content, evaluations)
            : evaluations,
      };
    })
  );

  for (const { sectionRow, evaluations } of llmResults) {
    const existing = existingBySectionId.get(sectionRow.id) ?? [];
    const existingByKey = new Map(existing.map((e) => [e.criterionKey, e]));
    const contentHash = hashContent(
      cleanSectionContentForEval(sectionRow.section, sectionRow.content),
      PROMPT_VERSION
    );

    for (const evalResult of evaluations) {
      const prior = existingByKey.get(evalResult.criterionKey);
      if (prior) {
        const keepBypass = prior.bypassed && evalResult.status !== "met";
        await db
          .update(criteriaEvaluations)
          .set({
            section: sectionRow.section,
            status: evalResult.status,
            criterionLabel: evalResult.criterionLabel,
            reasoning: evalResult.reasoning,
            bypassed: keepBypass,
            evaluatedContentHash: contentHash,
            updatedAt: new Date(),
          })
          .where(eq(criteriaEvaluations.id, prior.id));
      } else {
        await db.insert(criteriaEvaluations).values({
          reportId,
          sectionId: sectionRow.id,
          section: sectionRow.section,
          criterionKey: evalResult.criterionKey,
          criterionLabel: evalResult.criterionLabel,
          status: evalResult.status,
          reasoning: evalResult.reasoning,
          evaluatedContentHash: contentHash,
        });
      }
    }
  }

  return db
    .select()
    .from(criteriaEvaluations)
    .where(eq(criteriaEvaluations.reportId, reportId));
}
