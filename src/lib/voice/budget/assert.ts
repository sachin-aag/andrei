import { getVoiceBudgetSettings } from "./settings";
import { getCurrentMonthAudioSeconds } from "./record";
import { isVoiceBudgetTrackingSkipped } from "./enforcement";
import { VoiceBudgetExceededError } from "./errors";
import { secondsFromMinutes } from "@/lib/voice/pcm-duration";

export async function assertVoiceBudgetAvailable(input: {
  audioSeconds: number;
}): Promise<void> {
  if (isVoiceBudgetTrackingSkipped()) return;

  const settings = await getVoiceBudgetSettings();
  if (!settings.enforceHardLimit) return;

  const requestedSeconds = Math.max(0, input.audioSeconds);
  const committedSeconds = await getCurrentMonthAudioSeconds();
  const monthlySecondLimit = secondsFromMinutes(settings.monthlyMinuteLimit);

  if (committedSeconds + requestedSeconds > monthlySecondLimit) {
    throw new VoiceBudgetExceededError(
      settings.monthlyMinuteLimit,
      committedSeconds,
      requestedSeconds
    );
  }
}
