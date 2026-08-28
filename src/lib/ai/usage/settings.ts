import { eq } from "drizzle-orm";
import { aiBudgetSettings } from "@/db/schema";

export const AI_BUDGET_SETTINGS_ID = "default";
export const DEFAULT_MONTHLY_AI_BUDGET_USD = 500;
export const DEFAULT_AI_WARNING_THRESHOLD_PERCENT = 80;

export type AiBudgetSettings = {
  monthlyBudgetUsd: number;
  enforceHardLimit: boolean;
  warningThresholdPercent: number;
  updatedAt: Date;
};

export async function getAiBudgetSettings(): Promise<AiBudgetSettings> {
  const { db } = await import("@/db");
  const existing = await db.query.aiBudgetSettings.findFirst({
    where: eq(aiBudgetSettings.id, AI_BUDGET_SETTINGS_ID),
  });
  if (existing) {
    return {
      monthlyBudgetUsd: existing.monthlyBudgetUsd,
      enforceHardLimit: existing.enforceHardLimit,
      warningThresholdPercent: existing.warningThresholdPercent,
      updatedAt: existing.updatedAt,
    };
  }

  await db.insert(aiBudgetSettings).values({
    id: AI_BUDGET_SETTINGS_ID,
    monthlyBudgetUsd: DEFAULT_MONTHLY_AI_BUDGET_USD,
    enforceHardLimit: true,
    warningThresholdPercent: DEFAULT_AI_WARNING_THRESHOLD_PERCENT,
  });

  return {
    monthlyBudgetUsd: DEFAULT_MONTHLY_AI_BUDGET_USD,
    enforceHardLimit: true,
    warningThresholdPercent: DEFAULT_AI_WARNING_THRESHOLD_PERCENT,
    updatedAt: new Date(),
  };
}

export async function updateAiBudgetSettings(input: {
  monthlyBudgetUsd?: number;
  enforceHardLimit?: boolean;
  warningThresholdPercent?: number;
}): Promise<AiBudgetSettings> {
  await getAiBudgetSettings();

  const { db } = await import("@/db");
  const [updated] = await db
    .update(aiBudgetSettings)
    .set({
      ...(input.monthlyBudgetUsd !== undefined
        ? { monthlyBudgetUsd: input.monthlyBudgetUsd }
        : {}),
      ...(input.enforceHardLimit !== undefined
        ? { enforceHardLimit: input.enforceHardLimit }
        : {}),
      ...(input.warningThresholdPercent !== undefined
        ? { warningThresholdPercent: input.warningThresholdPercent }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(aiBudgetSettings.id, AI_BUDGET_SETTINGS_ID))
    .returning();

  if (!updated) {
    throw new Error("Failed to update AI budget settings");
  }

  return {
    monthlyBudgetUsd: updated.monthlyBudgetUsd,
    enforceHardLimit: updated.enforceHardLimit,
    warningThresholdPercent: updated.warningThresholdPercent,
    updatedAt: updated.updatedAt,
  };
}
