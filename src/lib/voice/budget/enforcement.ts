import { isTestStubSpeech } from "@/lib/test/ai-bypass";

/** Skip voice-budget checks and usage persistence in CI/E2E stub modes. */
export function isVoiceBudgetTrackingSkipped(): boolean {
  return isTestStubSpeech();
}
