import { eq } from "drizzle-orm";
import { voiceBudgetSettings } from "@/db/schema";

export const VOICE_BUDGET_SETTINGS_ID = "default";
/** Generous workspace cap: more than a month of continuous dictation. */
export const DEFAULT_MONTHLY_VOICE_MINUTE_LIMIT = 100_000;
export const DEFAULT_VOICE_WARNING_THRESHOLD_PERCENT = 80;

export type VoiceBudgetSettings = {
  monthlyMinuteLimit: number;
  enforceHardLimit: boolean;
  warningThresholdPercent: number;
  updatedAt: Date;
};

export async function getVoiceBudgetSettings(): Promise<VoiceBudgetSettings> {
  const { db } = await import("@/db");
  const existing = await db.query.voiceBudgetSettings.findFirst({
    where: eq(voiceBudgetSettings.id, VOICE_BUDGET_SETTINGS_ID),
  });
  if (existing) {
    return {
      monthlyMinuteLimit: existing.monthlyMinuteLimit,
      enforceHardLimit: existing.enforceHardLimit,
      warningThresholdPercent: existing.warningThresholdPercent,
      updatedAt: existing.updatedAt,
    };
  }

  await db.insert(voiceBudgetSettings).values({
    id: VOICE_BUDGET_SETTINGS_ID,
    monthlyMinuteLimit: DEFAULT_MONTHLY_VOICE_MINUTE_LIMIT,
    enforceHardLimit: true,
    warningThresholdPercent: DEFAULT_VOICE_WARNING_THRESHOLD_PERCENT,
  });

  return {
    monthlyMinuteLimit: DEFAULT_MONTHLY_VOICE_MINUTE_LIMIT,
    enforceHardLimit: true,
    warningThresholdPercent: DEFAULT_VOICE_WARNING_THRESHOLD_PERCENT,
    updatedAt: new Date(),
  };
}

export async function updateVoiceBudgetSettings(input: {
  monthlyMinuteLimit?: number;
  enforceHardLimit?: boolean;
  warningThresholdPercent?: number;
}): Promise<VoiceBudgetSettings> {
  await getVoiceBudgetSettings();

  const { db } = await import("@/db");
  const [updated] = await db
    .update(voiceBudgetSettings)
    .set({
      ...(input.monthlyMinuteLimit !== undefined
        ? { monthlyMinuteLimit: input.monthlyMinuteLimit }
        : {}),
      ...(input.enforceHardLimit !== undefined
        ? { enforceHardLimit: input.enforceHardLimit }
        : {}),
      ...(input.warningThresholdPercent !== undefined
        ? { warningThresholdPercent: input.warningThresholdPercent }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(voiceBudgetSettings.id, VOICE_BUDGET_SETTINGS_ID))
    .returning();

  if (!updated) {
    throw new Error("Failed to update voice budget settings");
  }

  return {
    monthlyMinuteLimit: updated.monthlyMinuteLimit,
    enforceHardLimit: updated.enforceHardLimit,
    warningThresholdPercent: updated.warningThresholdPercent,
    updatedAt: updated.updatedAt,
  };
}
