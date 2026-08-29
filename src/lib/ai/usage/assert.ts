import { getAiBudgetSettings } from "./settings";
import { getCurrentMonthSpendUsd } from "./record";
import { isAiBudgetTrackingSkipped } from "./enforcement";
import { AiBudgetExceededError } from "./errors";

export async function assertAiBudgetAvailable(): Promise<void> {
  if (isAiBudgetTrackingSkipped()) return;

  const settings = await getAiBudgetSettings();
  if (!settings.enforceHardLimit) return;

  const currentSpendUsd = await getCurrentMonthSpendUsd();
  if (currentSpendUsd >= settings.monthlyBudgetUsd) {
    throw new AiBudgetExceededError(settings.monthlyBudgetUsd, currentSpendUsd);
  }
}
