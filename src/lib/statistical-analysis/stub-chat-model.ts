import type { LanguageModel } from "ai";

/**
 * Text-only mock for analytics chat. Does not call propose_edit or any
 * drafting tools — stub chat cannot assert tool selection.
 */
export async function buildStubAnalyticsChatModel(): Promise<LanguageModel> {
  const { MockLanguageModelV3, convertArrayToReadableStream } = await import(
    "ai/test"
  );

  const usage = {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0, reasoning: 0 },
  };

  const reply =
    "I can pull numbers from this report's attachments into the worksheet, run a Normal Capability Sixpack, plot measurements as a scatter, or run a one-way ANOVA. Ask me to extract a column, run the sixpack, plot a requirement ID, or compare groups with ANOVA.";

  const doStream = async () => {
    const stubDelayMs = Number.parseInt(process.env.CHAT_STUB_DELAY_MS ?? "", 10);
    if (Number.isFinite(stubDelayMs) && stubDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, stubDelayMs));
    }
    return {
      stream: convertArrayToReadableStream([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: reply },
        { type: "text-end", id: "t1" },
        { type: "finish", finishReason: "stop", usage },
      ]),
    };
  };

  type MockArgs = ConstructorParameters<typeof MockLanguageModelV3>[0];
  return new MockLanguageModelV3({ doStream } as unknown as MockArgs) as unknown as LanguageModel;
}
