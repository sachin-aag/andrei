import {
  assertAiBudgetAvailable,
  getFeatureSpendUsd,
  isAiBudgetExceededError,
  isAiBudgetTrackingSkipped,
} from "@/lib/ai/usage";
import { PROOFREAD_MONTHLY_BUDGET_USD } from "@/lib/ai/proofread/prompts";

/**
 * Fail-open budget gate. Over the shared AI cap or the proofread sub-cap,
 * the route returns empty issues instead of 429ing chat / eval.
 */
export async function resolveProofreadBudgetSkip(): Promise<"budget" | null> {
  if (isAiBudgetTrackingSkipped()) return null;

  try {
    await assertAiBudgetAvailable();
  } catch (error) {
    if (isAiBudgetExceededError(error)) return "budget";
    throw error;
  }

  const featureSpend = await getFeatureSpendUsd("inline_proofread");
  if (featureSpend >= PROOFREAD_MONTHLY_BUDGET_USD) return "budget";
  return null;
}
