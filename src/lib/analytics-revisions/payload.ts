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

function omitKeys<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[]
): Omit<T, K> {
  const next = { ...obj };
  for (const key of keys) {
    Reflect.deleteProperty(next, key);
  }
  return next;
}

export function analysisForSnapshot(
  analysis: StatisticalAnalysisSummary
): AnalyticsRevisionAnalysis {
  return omitKeys(analysis, ["previewImage", "stale"]);
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
