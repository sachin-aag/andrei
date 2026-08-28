import { eq } from "drizzle-orm";
import { attachmentPageBudgetSettings } from "@/db/schema";

export const ATTACHMENT_PAGE_BUDGET_SETTINGS_ID = "default";
export const DEFAULT_MONTHLY_ATTACHMENT_PAGE_LIMIT = 100_000;
export const DEFAULT_ATTACHMENT_PAGE_WARNING_THRESHOLD_PERCENT = 80;

export type AttachmentPageBudgetSettings = {
  monthlyPageLimit: number;
  enforceHardLimit: boolean;
  warningThresholdPercent: number;
  updatedAt: Date;
};

export async function getAttachmentPageBudgetSettings(): Promise<AttachmentPageBudgetSettings> {
  const { db } = await import("@/db");
  const existing = await db.query.attachmentPageBudgetSettings.findFirst({
    where: eq(attachmentPageBudgetSettings.id, ATTACHMENT_PAGE_BUDGET_SETTINGS_ID),
  });
  if (existing) {
    return {
      monthlyPageLimit: existing.monthlyPageLimit,
      enforceHardLimit: existing.enforceHardLimit,
      warningThresholdPercent: existing.warningThresholdPercent,
      updatedAt: existing.updatedAt,
    };
  }

  await db.insert(attachmentPageBudgetSettings).values({
    id: ATTACHMENT_PAGE_BUDGET_SETTINGS_ID,
    monthlyPageLimit: DEFAULT_MONTHLY_ATTACHMENT_PAGE_LIMIT,
    enforceHardLimit: true,
    warningThresholdPercent: DEFAULT_ATTACHMENT_PAGE_WARNING_THRESHOLD_PERCENT,
  });

  return {
    monthlyPageLimit: DEFAULT_MONTHLY_ATTACHMENT_PAGE_LIMIT,
    enforceHardLimit: true,
    warningThresholdPercent: DEFAULT_ATTACHMENT_PAGE_WARNING_THRESHOLD_PERCENT,
    updatedAt: new Date(),
  };
}

export async function updateAttachmentPageBudgetSettings(input: {
  monthlyPageLimit?: number;
  enforceHardLimit?: boolean;
  warningThresholdPercent?: number;
}): Promise<AttachmentPageBudgetSettings> {
  await getAttachmentPageBudgetSettings();

  const { db } = await import("@/db");
  const [updated] = await db
    .update(attachmentPageBudgetSettings)
    .set({
      ...(input.monthlyPageLimit !== undefined
        ? { monthlyPageLimit: input.monthlyPageLimit }
        : {}),
      ...(input.enforceHardLimit !== undefined
        ? { enforceHardLimit: input.enforceHardLimit }
        : {}),
      ...(input.warningThresholdPercent !== undefined
        ? { warningThresholdPercent: input.warningThresholdPercent }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(attachmentPageBudgetSettings.id, ATTACHMENT_PAGE_BUDGET_SETTINGS_ID))
    .returning();

  if (!updated) {
    throw new Error("Failed to update attachment page budget settings");
  }

  return {
    monthlyPageLimit: updated.monthlyPageLimit,
    enforceHardLimit: updated.enforceHardLimit,
    warningThresholdPercent: updated.warningThresholdPercent,
    updatedAt: updated.updatedAt,
  };
}
