import { NextResponse } from "next/server";
import { currentYearMonthUtc, monthCycleBoundsUtc } from "@/lib/ai/usage/cycle";
import { AttachmentPageBudgetExceededError } from "./errors";
import { getAttachmentPageMonthSummary } from "./record";
import { getAttachmentPageBudgetSettings } from "./settings";

export { assertAttachmentPageBudgetAvailable } from "./assert";
export {
  recordAttachmentPageUsage,
  type RecordAttachmentPageUsageInput,
} from "./record";
export {
  getAttachmentPageBudgetSettings,
  updateAttachmentPageBudgetSettings,
  DEFAULT_MONTHLY_ATTACHMENT_PAGE_LIMIT,
  type AttachmentPageBudgetSettings,
} from "./settings";
export { AttachmentPageBudgetExceededError } from "./errors";
export { isAttachmentPageBudgetTrackingSkipped } from "./enforcement";

export type AttachmentPageBudgetStatus = {
  monthlyPageLimit: number;
  enforceHardLimit: boolean;
  warningThresholdPercent: number;
  currentMonthPageCount: number;
  inFlightPageCount: number;
  totalCommittedPageCount: number;
  percentUsed: number;
  isWarning: boolean;
  isOverBudget: boolean;
  yearMonth: string;
  cycleStart: string;
  cycleEnd: string;
  eventCount: number;
};

export async function getAttachmentPageBudgetStatus(): Promise<AttachmentPageBudgetStatus> {
  const yearMonth = currentYearMonthUtc();
  const [settings, usage] = await Promise.all([
    getAttachmentPageBudgetSettings(),
    getAttachmentPageMonthSummary(yearMonth),
  ]);
  const { cycleStart, cycleEnd } = monthCycleBoundsUtc(yearMonth);
  const percentUsed =
    settings.monthlyPageLimit > 0
      ? Math.round(
          (usage.totalCommittedPageCount / settings.monthlyPageLimit) * 1000
        ) / 10
      : 0;

  return {
    monthlyPageLimit: settings.monthlyPageLimit,
    enforceHardLimit: settings.enforceHardLimit,
    warningThresholdPercent: settings.warningThresholdPercent,
    currentMonthPageCount: usage.pageCount,
    inFlightPageCount: usage.inFlightPageCount,
    totalCommittedPageCount: usage.totalCommittedPageCount,
    percentUsed,
    isWarning: percentUsed >= settings.warningThresholdPercent,
    isOverBudget: usage.totalCommittedPageCount >= settings.monthlyPageLimit,
    yearMonth,
    cycleStart: cycleStart.toISOString(),
    cycleEnd: cycleEnd.toISOString(),
    eventCount: usage.eventCount,
  };
}

export function attachmentPageBudgetExceededResponse(
  error: AttachmentPageBudgetExceededError
): NextResponse {
  return NextResponse.json(
    {
      error: error.message,
      code: error.code,
      monthlyPageLimit: error.monthlyPageLimit,
      currentPageCount: error.currentPageCount,
      requestedPageCount: error.requestedPageCount,
    },
    { status: 429 }
  );
}

export function isAttachmentPageBudgetExceededError(
  error: unknown
): error is AttachmentPageBudgetExceededError {
  return error instanceof AttachmentPageBudgetExceededError;
}
