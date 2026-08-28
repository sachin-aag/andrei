export type NormalizedTokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

export function normalizeTokenUsage(usage: unknown): NormalizedTokenUsage {
  if (!usage || typeof usage !== "object") {
    return { inputTokens: 0, outputTokens: 0 };
  }

  const record = usage as {
    inputTokens?: number;
    outputTokens?: number;
    tokens?: number;
    totalTokens?: number;
  };

  const inputTokens = Math.max(
    0,
    Number.isFinite(record.inputTokens)
      ? record.inputTokens!
      : Number.isFinite(record.tokens)
        ? record.tokens!
        : Number.isFinite(record.totalTokens)
          ? record.totalTokens!
          : 0
  );
  const outputTokens = Math.max(
    0,
    Number.isFinite(record.outputTokens) ? record.outputTokens! : 0
  );

  return { inputTokens, outputTokens };
}
