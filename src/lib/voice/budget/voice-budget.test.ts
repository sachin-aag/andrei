import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceBudgetExceededError } from "./errors";

vi.mock("./settings", () => ({
  getVoiceBudgetSettings: vi.fn(),
}));

vi.mock("./record", () => ({
  getCurrentMonthAudioSeconds: vi.fn(),
}));

vi.mock("./enforcement", () => ({
  isVoiceBudgetTrackingSkipped: vi.fn(() => false),
}));

import { assertVoiceBudgetAvailable } from "./assert";
import { getVoiceBudgetSettings } from "./settings";
import { getCurrentMonthAudioSeconds } from "./record";

describe("voice transcription budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when committed audio plus request exceeds the monthly minute limit", async () => {
    vi.mocked(getVoiceBudgetSettings).mockResolvedValueOnce({
      monthlyMinuteLimit: 100_000,
      enforceHardLimit: true,
      warningThresholdPercent: 80,
      updatedAt: new Date(),
    });
    vi.mocked(getCurrentMonthAudioSeconds).mockResolvedValueOnce(6_000_000 - 10);

    await expect(
      assertVoiceBudgetAvailable({ audioSeconds: 30 })
    ).rejects.toBeInstanceOf(VoiceBudgetExceededError);
  });

  it("allows transcription when under the monthly limit", async () => {
    vi.mocked(getVoiceBudgetSettings).mockResolvedValueOnce({
      monthlyMinuteLimit: 100_000,
      enforceHardLimit: true,
      warningThresholdPercent: 80,
      updatedAt: new Date(),
    });
    vi.mocked(getCurrentMonthAudioSeconds).mockResolvedValueOnce(1_200);

    await expect(
      assertVoiceBudgetAvailable({ audioSeconds: 30 })
    ).resolves.toBeUndefined();
  });

  it("skips enforcement when hard limit is disabled", async () => {
    vi.mocked(getVoiceBudgetSettings).mockResolvedValueOnce({
      monthlyMinuteLimit: 100_000,
      enforceHardLimit: false,
      warningThresholdPercent: 80,
      updatedAt: new Date(),
    });

    await expect(
      assertVoiceBudgetAvailable({ audioSeconds: 9_000_000 })
    ).resolves.toBeUndefined();

    expect(getCurrentMonthAudioSeconds).not.toHaveBeenCalled();
  });
});
