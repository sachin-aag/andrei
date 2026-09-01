import { createId } from "@paralleldrive/cuid2";
import { and, eq, sql } from "drizzle-orm";
import { aiUsageEvents, type AiUsageFeature } from "@/db/schema";
import { currentYearMonthUtc } from "./cycle";
import { estimateAiUsageCostUsd, roundUsd } from "./estimate-cost";
import { isAiBudgetTrackingSkipped } from "./enforcement";
import { normalizeTokenUsage } from "./token-usage";

export type RecordAiUsageInput = {
  feature: AiUsageFeature;
  modelId: string;
  usage?: unknown;
  inputTokens?: number | null;
  outputTokens?: number | null;
  reportId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordAiUsage(input: RecordAiUsageInput): Promise<void> {
  if (isAiBudgetTrackingSkipped()) return;

  const normalized =
    input.inputTokens !== undefined || input.outputTokens !== undefined
      ? {
          inputTokens: Math.max(0, input.inputTokens ?? 0),
          outputTokens: Math.max(0, input.outputTokens ?? 0),
        }
      : normalizeTokenUsage(input.usage);

  if (normalized.inputTokens === 0 && normalized.outputTokens === 0) {
    return;
  }

  const estimatedCostUsd = estimateAiUsageCostUsd({
    modelId: input.modelId,
    inputTokens: normalized.inputTokens,
    outputTokens: normalized.outputTokens,
  });

  const { db } = await import("@/db");
  await db.insert(aiUsageEvents).values({
    id: createId(),
    yearMonth: currentYearMonthUtc(),
    feature: input.feature,
    modelId: input.modelId,
    inputTokens: normalized.inputTokens,
    outputTokens: normalized.outputTokens,
    estimatedCostUsd,
    reportId: input.reportId ?? null,
    userId: input.userId ?? null,
    metadata: input.metadata ?? {},
  });
}

export type AiUsageFeatureBreakdown = {
  feature: AiUsageFeature;
  spendUsd: number;
  inputTokens: number;
  outputTokens: number;
  eventCount: number;
};

export type AiUsageMonthSummary = {
  yearMonth: string;
  spendUsd: number;
  inputTokens: number;
  outputTokens: number;
  eventCount: number;
  featureBreakdown: AiUsageFeatureBreakdown[];
};

export async function getAiUsageMonthSummary(
  yearMonth = currentYearMonthUtc()
): Promise<AiUsageMonthSummary> {
  const { db } = await import("@/db");
  const [totals] = await db
    .select({
      spendUsd: sql<number>`coalesce(sum(${aiUsageEvents.estimatedCostUsd}), 0)`,
      inputTokens: sql<number>`coalesce(sum(${aiUsageEvents.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${aiUsageEvents.outputTokens}), 0)`,
      eventCount: sql<number>`count(*)::int`,
    })
    .from(aiUsageEvents)
    .where(eq(aiUsageEvents.yearMonth, yearMonth));

  const featureRows = await db
    .select({
      feature: aiUsageEvents.feature,
      spendUsd: sql<number>`coalesce(sum(${aiUsageEvents.estimatedCostUsd}), 0)`,
      inputTokens: sql<number>`coalesce(sum(${aiUsageEvents.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${aiUsageEvents.outputTokens}), 0)`,
      eventCount: sql<number>`count(*)::int`,
    })
    .from(aiUsageEvents)
    .where(eq(aiUsageEvents.yearMonth, yearMonth))
    .groupBy(aiUsageEvents.feature)
    .orderBy(sql`sum(${aiUsageEvents.estimatedCostUsd}) desc`);

  return {
    yearMonth,
    spendUsd: roundUsd(Number(totals?.spendUsd ?? 0)),
    inputTokens: Number(totals?.inputTokens ?? 0),
    outputTokens: Number(totals?.outputTokens ?? 0),
    eventCount: Number(totals?.eventCount ?? 0),
    featureBreakdown: featureRows.map((row) => ({
      feature: row.feature,
      spendUsd: roundUsd(Number(row.spendUsd ?? 0)),
      inputTokens: Number(row.inputTokens ?? 0),
      outputTokens: Number(row.outputTokens ?? 0),
      eventCount: Number(row.eventCount ?? 0),
    })),
  };
}

export async function getCurrentMonthSpendUsd(): Promise<number> {
  const summary = await getAiUsageMonthSummary();
  return summary.spendUsd;
}

export async function getFeatureSpendUsd(
  feature: AiUsageFeature,
  yearMonth = currentYearMonthUtc()
): Promise<number> {
  const { db } = await import("@/db");
  const [row] = await db
    .select({
      spendUsd: sql<number>`coalesce(sum(${aiUsageEvents.estimatedCostUsd}), 0)`,
    })
    .from(aiUsageEvents)
    .where(
      and(eq(aiUsageEvents.yearMonth, yearMonth), eq(aiUsageEvents.feature, feature))
    );
  return roundUsd(Number(row?.spendUsd ?? 0));
}
