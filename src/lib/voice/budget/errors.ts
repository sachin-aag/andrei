export class VoiceBudgetExceededError extends Error {
  readonly code = "voice_budget_exceeded" as const;
  readonly monthlyMinuteLimit: number;
  readonly currentAudioSeconds: number;
  readonly requestedAudioSeconds: number;

  constructor(
    monthlyMinuteLimit: number,
    currentAudioSeconds: number,
    requestedAudioSeconds: number
  ) {
    super(
      "This workspace has reached its monthly voice transcription limit. Contact your administrator."
    );
    this.name = "VoiceBudgetExceededError";
    this.monthlyMinuteLimit = monthlyMinuteLimit;
    this.currentAudioSeconds = currentAudioSeconds;
    this.requestedAudioSeconds = requestedAudioSeconds;
  }
}
