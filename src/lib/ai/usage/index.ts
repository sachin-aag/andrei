import { NextResponse } from "next/server";
import { currentYearMonthUtc, monthCycleBoundsUtc } from "./cycle";
import { AiBudgetExceededError } from "./errors";
import { getAiUsageMonthSummary } from "./record";
import { getAiBudgetSettings } from "./settings";
import { roundUsd } from "./estimate-cost";

export { assertAiBudgetAvailable } from "./assert";
export { recordAiUsage, getFeatureSpendUsd, type RecordAiUsageInput } from "./record";
export {
  getAiBudgetSettings,
  updateAiBudgetSettings,
  DEFAULT_MONTHLY_AI_BUDGET_USD,
  type AiBudgetSettings,
} from "./settings";
export { AiBudgetExceededError } from "./errors";
export { estimateAiUsageCostUsd } from "./estimate-cost";
export { normalizeTokenUsage } from "./token-usage";
export { isAiBudgetTrackingSkipped } from "./enforcement";

export type AiBudgetStatus = {
  monthlyBudgetUsd: number;
  enforceHardLimit: boolean;
  warningThresholdPercent: number;
  currentMonthSpendUsd: number;
  percentUsed: number;
  isWarning: boolean;
  isOverBudget: boolean;
  yearMonth: string;
  cycleStart: string;
  cycleEnd: string;
  featureBreakdown: Awaited<
    ReturnType<typeof getAiUsageMonthSummary>
  >["featureBreakdown"];
};

export async function getAiBudgetStatus(): Promise<AiBudgetStatus> {
  const yearMonth = currentYearMonthUtc();
  const [settings, usage] = await Promise.all([
    getAiBudgetSettings(),
    getAiUsageMonthSummary(yearMonth),
  ]);
  const { cycleStart, cycleEnd } = monthCycleBoundsUtc(yearMonth);
  const percentUsed =
    settings.monthlyBudgetUsd > 0
      ? roundUsd((usage.spendUsd / settings.monthlyBudgetUsd) * 100)
      : 0;

  return {
    monthlyBudgetUsd: settings.monthlyBudgetUsd,
    enforceHardLimit: settings.enforceHardLimit,
    warningThresholdPercent: settings.warningThresholdPercent,
    currentMonthSpendUsd: usage.spendUsd,
    percentUsed,
    isWarning: percentUsed >= settings.warningThresholdPercent,
    isOverBudget: usage.spendUsd >= settings.monthlyBudgetUsd,
    yearMonth,
    cycleStart: cycleStart.toISOString(),
    cycleEnd: cycleEnd.toISOString(),
    featureBreakdown: usage.featureBreakdown,
  };
}

export function aiBudgetExceededResponse(error: AiBudgetExceededError): NextResponse {
  return NextResponse.json(
    {
      error: error.message,
      code: error.code,
      monthlyBudgetUsd: error.monthlyBudgetUsd,
      currentSpendUsd: error.currentSpendUsd,
    },
    { status: 429 }
  );
}

export function isAiBudgetExceededError(error: unknown): error is AiBudgetExceededError {
  return error instanceof AiBudgetExceededError;
}
