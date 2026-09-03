/**
 * Estimated Gemini pricing in USD per 1M tokens.
 * Update when Google changes public rates; used for budget enforcement only.
 */
export type ModelPricing = {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
};

const DEFAULT_PRICING: ModelPricing = {
  inputPerMillionUsd: 0.3,
  outputPerMillionUsd: 1.2,
};

const MODEL_PRICING_USD_PER_MILLION: Record<string, ModelPricing> = {
  "gemini-2.5-flash-lite": { inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.4 },
  "gemini-3.1-flash-lite": { inputPerMillionUsd: 0.25, outputPerMillionUsd: 1.5 },
  "gemini-3.5-flash-lite": { inputPerMillionUsd: 0.3, outputPerMillionUsd: 2.5 },
  "gemini-2.5-flash": { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 },
  "gemini-3.7-flash": { inputPerMillionUsd: 0.2, outputPerMillionUsd: 0.8 },
  "gemini-3.1-pro-preview": { inputPerMillionUsd: 1.25, outputPerMillionUsd: 5.0 },
  "gemini-embedding-001": { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0 },
};

export function resolveModelPricing(modelId: string): ModelPricing {
  const normalized = modelId.trim().toLowerCase();
  const direct = MODEL_PRICING_USD_PER_MILLION[normalized];
  if (direct) return direct;

  if (normalized.includes("embedding")) {
    return MODEL_PRICING_USD_PER_MILLION["gemini-embedding-001"] ?? DEFAULT_PRICING;
  }
  if (normalized.includes("pro")) {
    return MODEL_PRICING_USD_PER_MILLION["gemini-3.1-pro-preview"] ?? DEFAULT_PRICING;
  }
  if (normalized.includes("2.5") && (normalized.includes("flash-lite") || normalized.includes("flash_lite"))) {
    return MODEL_PRICING_USD_PER_MILLION["gemini-2.5-flash-lite"] ?? DEFAULT_PRICING;
  }
  if (normalized.includes("flash-lite") || normalized.includes("flash_lite")) {
    return MODEL_PRICING_USD_PER_MILLION["gemini-3.5-flash-lite"] ?? DEFAULT_PRICING;
  }
  if (normalized.includes("flash")) {
    return MODEL_PRICING_USD_PER_MILLION["gemini-3.7-flash"] ?? DEFAULT_PRICING;
  }

  return DEFAULT_PRICING;
}
