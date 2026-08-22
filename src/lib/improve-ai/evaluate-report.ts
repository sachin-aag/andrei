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
  evaluationContentHash,
  type AllSectionsContent,
} from "@/lib/ai/evaluate";
import {
  getCriteria,
  getInvestigationEvaluatableSections,
} from "@/lib/ai/criteria";
import { normalizeAnalyzeToolResults } from "@/lib/ai/evaluate-run-helpers";
import { mergeSection } from "@/lib/sections-merge";
import { getDocumentType } from "@/lib/document-types";

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

  const targetSections: SectionType[] = [
    ...getInvestigationEvaluatableSections(),
  ];

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
        inArray(reportSections.section, targetSections)
      )
    );

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

  // Merged content everywhere, matching the suggestions route's hash input.
  const allSections: AllSectionsContent = {};
  for (const row of allEvaluatableRows) {
    allSections[row.section] = mergeSection(row.section, row.content);
  }
  const mergedFor = (row: (typeof sectionRows)[number]) =>
    allSections[row.section] ?? mergeSection(row.section, row.content);

  const llmResults = await Promise.all(
    sectionRows.map(async (row) => {
      const content = mergedFor(row);
      const evaluations = await evaluateSection({
        section: row.section,
        content,
        reportContext: { deviationNo: report.documentNo, date: report.date },
        allSections,
      });
      return {
        sectionRow: row,
        evaluations:
          row.section === "analyze"
            ? normalizeAnalyzeToolResults(content, evaluations)
            : evaluations,
      };
    })
  );

  for (const { sectionRow, evaluations } of llmResults) {
    const existing = existingBySectionId.get(sectionRow.id) ?? [];
    const existingByKey = new Map(existing.map((e) => [e.criterionKey, e]));
    const contentHash = evaluationContentHash({
      section: sectionRow.section,
      content: mergedFor(sectionRow),
      allSections,
      criteria: getCriteria(sectionRow.section),
      promptVersion: getDocumentType("investigation_report").prompts.promptVersion,
    });

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
