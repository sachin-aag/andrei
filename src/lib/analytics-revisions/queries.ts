import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { analyticsRevisions } from "@/db/schema";
import type { AnalyticsRevisionPayload } from "@/lib/analytics-revisions/payload";
import type { WorksheetData } from "@/lib/statistical-analysis/types";

export async function listAnalyticsRevisions(reportId: string) {
  return db
    .select({
      id: analyticsRevisions.id,
      revisionNo: analyticsRevisions.revisionNo,
      source: analyticsRevisions.source,
      summary: analyticsRevisions.summary,
      createdAt: analyticsRevisions.createdAt,
      updatedAt: analyticsRevisions.updatedAt,
      createdBy: analyticsRevisions.createdBy,
    })
    .from(analyticsRevisions)
    .where(eq(analyticsRevisions.reportId, reportId))
    .orderBy(asc(analyticsRevisions.revisionNo));
}

export async function loadAnalyticsRevisionPayloads(
  reportId: string,
  revisionNos: number[]
): Promise<{ revisionNo: number; payload: AnalyticsRevisionPayload }[]> {
  if (revisionNos.length === 0) return [];
  const rows = await db
    .select({
      revisionNo: analyticsRevisions.revisionNo,
      worksheet: analyticsRevisions.worksheet,
      analyses: analyticsRevisions.analyses,
    })
    .from(analyticsRevisions)
    .where(
      and(
        eq(analyticsRevisions.reportId, reportId),
        inArray(analyticsRevisions.revisionNo, revisionNos)
      )
    );
  return rows.map((row) => ({
    revisionNo: row.revisionNo,
    payload: {
      worksheet: row.worksheet as WorksheetData,
      analyses: Array.isArray(row.analyses)
        ? (row.analyses as AnalyticsRevisionPayload["analyses"])
        : [],
    },
  }));
}
