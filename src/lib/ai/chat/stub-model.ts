import type { LanguageModel } from "ai";
import type { SectionType } from "@/db/schema";

export type StubChatPlan = {
  section: SectionType;
  targetField: string;
  insertText: string;
  reasoning: string;
  summaryText: string;
};

/**
 * Scripted mock model (test-only) that drives the REAL chat pipeline with no
 * Gemini credential: step 1 calls `propose_edit`, step 2 replies with a text
 * summary. Only the model is swapped — streamText, the tool, comment creation,
 * and persistence all run unchanged. `ai/test` is imported dynamically so it
 * never enters the production bundle.
 */
export async function buildStubChatModel(plan: StubChatPlan): Promise<LanguageModel> {
  const { MockLanguageModelV3, convertArrayToReadableStream } = await import("ai/test");

  const usage = {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0, reasoning: 0 },
  };
  let call = 0;

  // Runtime chunk shapes match the LanguageModelV3 stream contract; the cast
  // only bridges a TS type-identity gap (@ai-sdk/provider is not a top-level
  // dependency, so its stream-part type is not importable here).
  const doStream = async () => {
    const step = call++;
    if (step === 0) {
      return {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          {
            type: "tool-call",
            toolCallId: `stub-${Date.now()}`,
            toolName: "propose_edit",
            input: JSON.stringify({
              section: plan.section,
              targetField: plan.targetField,
              anchorText: "",
              deleteText: "",
              insertText: plan.insertText,
              reasoning: plan.reasoning,
            }),
          },
          { type: "finish", finishReason: "tool-calls", usage },
        ]),
      };
    }
    return {
      stream: convertArrayToReadableStream([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: plan.summaryText },
        { type: "text-end", id: "t1" },
        { type: "finish", finishReason: "stop", usage },
      ]),
    };
  };

  type MockArgs = ConstructorParameters<typeof MockLanguageModelV3>[0];
  return new MockLanguageModelV3({ doStream } as unknown as MockArgs) as unknown as LanguageModel;
}
