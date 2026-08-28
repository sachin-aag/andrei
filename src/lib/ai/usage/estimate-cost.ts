import { resolveModelPricing } from "./pricing";

export function estimateAiUsageCostUsd(input: {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  const pricing = resolveModelPricing(input.modelId);
  const inputCost =
    (Math.max(0, input.inputTokens) / 1_000_000) * pricing.inputPerMillionUsd;
  const outputCost =
    (Math.max(0, input.outputTokens) / 1_000_000) * pricing.outputPerMillionUsd;
  return roundUsd(inputCost + outputCost);
}

export function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
