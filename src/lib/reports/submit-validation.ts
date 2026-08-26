import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reports, reportSections } from "@/db/schema";
import { getDocumentType } from "@/lib/document-types";
import { collectPlaceholders } from "@/lib/placeholders/scan-sections";
import { loadReportSectionContentMap } from "@/lib/reports/compute-content-hash";
import type { ReportRecord } from "@/types/report";

export async function findUnfilledMandatoryPlaceholders(reportId: string) {
  const sections = await loadReportSectionContentMap(reportId);
  return collectPlaceholders(sections);
}

export async function assertReportReadyForSubmit(
  reportId: string
): Promise<{ ok: true } | { ok: false; message: string; placeholders: number }> {
  const placeholders = await findUnfilledMandatoryPlaceholders(reportId);
  if (placeholders.length > 0) {
    return {
      ok: false,
      message: `Report has ${placeholders.length} unfilled mandatory placeholder(s). Complete all required fields before submitting.`,
      placeholders: placeholders.length,
    };
  }

  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) {
    return { ok: false, message: "Report not found.", placeholders: 0 };
  }
  const def = getDocumentType(report.documentType);
  if (!def.submitValidation) return { ok: true };

  const sectionRows = await db
    .select()
    .from(reportSections)
    .where(eq(reportSections.reportId, reportId));
  const result = def.submitValidation({
    report: report as unknown as ReportRecord,
    sections: sectionRows.map((row) => ({
      section: row.section,
      content: row.content,
    })),
  });
  if (!result.ok) {
    return { ok: false, message: result.message, placeholders: 0 };
  }
  return { ok: true };
}
