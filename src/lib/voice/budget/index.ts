import { NextResponse } from "next/server";
import { currentYearMonthUtc, monthCycleBoundsUtc } from "@/lib/ai/usage/cycle";
import { VoiceBudgetExceededError } from "./errors";
import { getVoiceMonthSummary } from "./record";
import { getVoiceBudgetSettings } from "./settings";
import { minutesFromSeconds, secondsFromMinutes } from "@/lib/voice/pcm-duration";

export { assertVoiceBudgetAvailable } from "./assert";
export { recordVoiceUsage, type RecordVoiceUsageInput } from "./record";
export {
  getVoiceBudgetSettings,
  updateVoiceBudgetSettings,
  DEFAULT_MONTHLY_VOICE_MINUTE_LIMIT,
  type VoiceBudgetSettings,
} from "./settings";
export { VoiceBudgetExceededError } from "./errors";
export { isVoiceBudgetTrackingSkipped } from "./enforcement";

export type VoiceBudgetStatus = {
  monthlyMinuteLimit: number;
  enforceHardLimit: boolean;
  warningThresholdPercent: number;
  currentMonthAudioSeconds: number;
  currentMonthMinutes: number;
  percentUsed: number;
  isWarning: boolean;
  isOverBudget: boolean;
  yearMonth: string;
  cycleStart: string;
  cycleEnd: string;
  eventCount: number;
};

export async function getVoiceBudgetStatus(): Promise<VoiceBudgetStatus> {
  const yearMonth = currentYearMonthUtc();
  const [settings, usage] = await Promise.all([
    getVoiceBudgetSettings(),
    getVoiceMonthSummary(yearMonth),
  ]);
  const { cycleStart, cycleEnd } = monthCycleBoundsUtc(yearMonth);
  const monthlySecondLimit = secondsFromMinutes(settings.monthlyMinuteLimit);
  const percentUsed =
    monthlySecondLimit > 0
      ? Math.round((usage.audioSeconds / monthlySecondLimit) * 1000) / 10
      : 0;

  return {
    monthlyMinuteLimit: settings.monthlyMinuteLimit,
    enforceHardLimit: settings.enforceHardLimit,
    warningThresholdPercent: settings.warningThresholdPercent,
    currentMonthAudioSeconds: usage.audioSeconds,
    currentMonthMinutes: minutesFromSeconds(usage.audioSeconds),
    percentUsed,
    isWarning: percentUsed >= settings.warningThresholdPercent,
    isOverBudget: usage.audioSeconds >= monthlySecondLimit,
    yearMonth,
    cycleStart: cycleStart.toISOString(),
    cycleEnd: cycleEnd.toISOString(),
    eventCount: usage.eventCount,
  };
}

export function voiceBudgetExceededResponse(
  error: VoiceBudgetExceededError
): NextResponse {
  return NextResponse.json(
    {
      error: error.message,
      code: error.code,
      monthlyMinuteLimit: error.monthlyMinuteLimit,
      currentAudioSeconds: error.currentAudioSeconds,
      requestedAudioSeconds: error.requestedAudioSeconds,
    },
    { status: 429 }
  );
}

export function isVoiceBudgetExceededError(
  error: unknown
): error is VoiceBudgetExceededError {
  return error instanceof VoiceBudgetExceededError;
}
