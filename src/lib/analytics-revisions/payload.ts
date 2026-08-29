import { hashSectionContent } from "@/lib/audit";
import type { StatisticalAnalysisSummary, WorksheetData } from "@/lib/statistical-analysis/types";

export type AnalyticsRevisionAnalysis = Omit<
  StatisticalAnalysisSummary,
  "previewImage" | "stale"
>;

export type AnalyticsRevisionPayload = {
  worksheet: WorksheetData;
  analyses: AnalyticsRevisionAnalysis[];
};

export function analysisForSnapshot(
  analysis: StatisticalAnalysisSummary
): AnalyticsRevisionAnalysis {
  const { previewImage: _previewImage, stale: _stale, ...rest } = analysis;
  return rest;
}

export function analyticsRevisionPayload(args: {
  worksheet: WorksheetData;
  analyses: StatisticalAnalysisSummary[];
}): AnalyticsRevisionPayload {
  return {
    worksheet: args.worksheet,
    analyses: args.analyses
      .map(analysisForSnapshot)
      .toSorted((a, b) => a.id.localeCompare(b.id)),
  };
}

export function analyticsRevisionHash(payload: AnalyticsRevisionPayload): string {
  return hashSectionContent(payload);
}
