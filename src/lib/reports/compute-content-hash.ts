import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportSections } from "@/db/schema";
import { hashSectionContent } from "@/lib/audit/content-hash";
import type { SectionContentMap } from "@/types/sections";
import type { SectionType } from "@/db/schema";

export async function loadReportSectionContentMap(
  reportId: string
): Promise<Partial<SectionContentMap>> {
  const rows = await db
    .select({
      section: reportSections.section,
      content: reportSections.content,
    })
    .from(reportSections)
    .where(eq(reportSections.reportId, reportId));

  const map: Partial<SectionContentMap> = {};
  for (const row of rows) {
    (map as Record<string, unknown>)[row.section] = row.content;
  }
  return map;
}

export async function computeReportContentHash(reportId: string): Promise<string> {
  const sections = await loadReportSectionContentMap(reportId);
  return hashSectionContent(sections);
}

export async function computeReportVersionSeq(reportId: string): Promise<number> {
  const rows = await db.query.sectionContentVersions.findMany({
    where: (t, { eq }) => eq(t.reportId, reportId),
    columns: { versionNo: true },
  });
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((row) => row.versionNo));
}
