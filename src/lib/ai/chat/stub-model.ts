import type { LanguageModel } from "ai";
import type { SectionType } from "@/db/schema";
import type { ChatMode } from "@/lib/ai/chat/system-prompt";
import { sectionLabel } from "@/lib/ai/chat/fields";
import type { SectionScopeMismatch } from "@/lib/ai/chat/section-intent";

export type StubChatPlan = {
  mode: ChatMode;
  section: SectionType;
  targetField: string;
  insertText: string;
  reasoning: string;
  scopeMismatch?: SectionScopeMismatch | null;
};

/**
 * Scripted mock model (test-only) that drives the REAL chat pipeline with no
 * Gemini credential. Only the model is swapped — streamText, tools, comment
 * creation, and persistence all run unchanged. `ai/test` is imported
 * dynamically so it never enters the production bundle.
 *
 * - Plan mode: replies with follow-up questions (no edit tool call).
 * - Agent mode: calls `propose_edit`, then replies with a summary.
 * - Scope mismatch: calls `suggest_section_scope` before substantive reply.
 */
export async function buildStubChatModel(plan: StubChatPlan): Promise<LanguageModel> {
  const { MockLanguageModelV3, convertArrayToReadableStream } = await import("ai/test");

  const usage = {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0, reasoning: 0 },
  };
  const label = sectionLabel(plan.section);
  let call = 0;

  const planText =
    `Before I draft anything, a few quick questions (skip any you don't know — I'll use placeholders):\n\n` +
    `1. What exactly happened, and on which equipment or system?\n` +
    `2. When was it detected, and by whom?\n` +
    `3. Which product/batch or material is impacted?\n` +
    `4. Any early idea of the root cause?\n\n` +
    `Plan: with answers to 1–3 I can draft the ${label} section now (placeholders for gaps) and skip sections I have too little for. ` +
    `Switch to Agent mode when you're ready and I'll generate the draft.`;

  const agentSummary =
    `I drafted an addition to the ${label} section — review the highlighted insertion in the document and accept or reject it. ` +
    `Replace any [bracketed placeholders] with the real values. I skipped sections I had too little information for.`;

  const mismatch = plan.scopeMismatch;
  const mismatchFollowUp = mismatch
    ? `Switch the section dropdown to ${sectionLabel(mismatch.suggestedSection)} and ask again, or keep ${sectionLabel(mismatch.currentSection)} if you meant that section.`
    : "";

  const doStream = async () => {
    const step = call++;

    if (mismatch && step === 0) {
      return {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          {
            type: "tool-call",
            toolCallId: `stub-scope-${Date.now()}`,
            toolName: "suggest_section_scope",
            input: JSON.stringify({
              suggestedSection: mismatch.suggestedSection,
              reason: mismatch.reason,
            }),
          },
          { type: "finish", finishReason: "tool-calls", usage },
        ]),
      };
    }

    if (mismatch && step === 1) {
      return {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: mismatchFollowUp },
          { type: "text-end", id: "t1" },
          { type: "finish", finishReason: "stop", usage },
        ]),
      };
    }

    if (plan.mode === "plan") {
      return {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: planText },
          { type: "text-end", id: "t1" },
          { type: "finish", finishReason: "stop", usage },
        ]),
      };
    }

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
        { type: "text-delta", id: "t1", delta: agentSummary },
        { type: "text-end", id: "t1" },
        { type: "finish", finishReason: "stop", usage },
      ]),
    };
  };

  type MockArgs = ConstructorParameters<typeof MockLanguageModelV3>[0];
  return new MockLanguageModelV3({ doStream } as unknown as MockArgs) as unknown as LanguageModel;
}
