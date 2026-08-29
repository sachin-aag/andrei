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
import { normalizeAnalyzeToolResults } from "@/lib/ai/evaluate-run-helpers";
import { sectionsReadyForEvaluation } from "@/lib/ai/evaluation-readiness";
import {
  getDocumentType,
  getEvaluatableSections,
  mergeSectionForType,
} from "@/lib/document-types";
import type { ReportRecord } from "@/types/report";

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
 * Runs AI criteria evaluation for every evaluable section on a report and
 * upserts `criteria_evaluations` rows (same behavior as POST
 * `/api/reports/[id]/evaluate`).
 */
export async function evaluateReportCriteria(
  reportId: string
): Promise<ReportEvaluationRow[]> {
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) {
    throw new ImproveAiEvaluationError("Report not found", 404);
  }

  const documentType = report.documentType;
  const def = getDocumentType(documentType);
  const targetSections: SectionType[] = getEvaluatableSections(documentType).map(
    (section) => section.key
  );

  if (targetSections.length === 0) {
    return db
      .select()
      .from(criteriaEvaluations)
      .where(eq(criteriaEvaluations.reportId, reportId));
  }

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
  const bySection = new Map<string, (typeof allEvaluatableRows)[number]>();
  for (const row of allEvaluatableRows) bySection.set(row.section, row);

  const allSections: AllSectionsContent = {};
  for (const row of allEvaluatableRows) {
    allSections[row.section] = mergeSectionForType(
      documentType,
      row.section,
      row.content
    );
  }
  if (targetSections.includes("cover_page")) {
    allSections.cover_page = report.metadata;
  }

  const readiness = sectionsReadyForEvaluation({
    documentType,
    targets: targetSections,
    documentNo: String(report.documentNo ?? ""),
    contentFor: (section) => {
      if (section === "cover_page") return report.metadata;
      const row = bySection.get(section);
      return row
        ? mergeSectionForType(documentType, section, row.content)
        : undefined;
    },
  });
  const readySet = new Set(readiness.ready);
  const readySectionRows = sectionRows.filter((row) => readySet.has(row.section));

  const existingForSections = readySectionRows.length
    ? await db
        .select()
        .from(criteriaEvaluations)
        .where(
          inArray(
            criteriaEvaluations.sectionId,
            readySectionRows.map((r) => r.id)
          )
        )
    : [];
  const existingBySectionId = new Map<string, typeof existingForSections>();
  for (const row of existingForSections) {
    const arr = existingBySectionId.get(row.sectionId) ?? [];
    arr.push(row);
    existingBySectionId.set(row.sectionId, arr);
  }

  const mergedFor = (row: (typeof readySectionRows)[number]) =>
    allSections[row.section] ??
    mergeSectionForType(documentType, row.section, row.content);

  const reportForEval = report as unknown as ReportRecord;

  const llmResults = await Promise.all(
    readySectionRows.map(async (row) => {
      const content =
        row.section === "cover_page" ? report.metadata : mergedFor(row);
      const evaluations = await evaluateSection({
        section: row.section,
        content,
        reportContext: { deviationNo: report.documentNo, date: report.date },
        allSections,
        documentType,
        report: reportForEval,
      });
      return {
        sectionRow: row,
        evaluations:
          documentType === "investigation_report" && row.section === "analyze"
            ? normalizeAnalyzeToolResults(content, evaluations)
            : evaluations,
      };
    })
  );

  for (const { sectionRow, evaluations } of llmResults) {
    const existing = existingBySectionId.get(sectionRow.id) ?? [];
    const existingByKey = new Map(existing.map((e) => [e.criterionKey, e]));
    const sectionCriteria = def.criteriaBySection[sectionRow.section] ?? [];
    const contentHash = evaluationContentHash({
      section: sectionRow.section,
      content:
        sectionRow.section === "cover_page"
          ? report.metadata
          : mergedFor(sectionRow),
      allSections,
      criteria: sectionCriteria,
      promptVersion: def.prompts.promptVersion,
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
