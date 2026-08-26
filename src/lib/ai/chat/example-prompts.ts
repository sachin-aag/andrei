import { coerceChatMode } from "@/lib/ai/chat/composer-prefs";
import type { ChatMode } from "@/lib/ai/chat/system-prompt";

export const EXAMPLE_PROMPTS: Record<ChatMode, string[]> = {
  plan: [
    "What does the evidence say about the root cause?",
    "Which quality criteria is the Define section still missing?",
    "Summarize what the batch record says about the out-of-spec result.",
  ],
  agent: [
    "Draft the Define section from what we discussed.",
    "Tighten the problem statement and scope in Define.",
    "Propose a clearer root cause and impact assessment in Analyze.",
  ],
};

/** Empty-state chips. Invalid mode (Radix "" after a remount) must not throw. */
export function examplePromptsForMode(mode: unknown): string[] {
  return EXAMPLE_PROMPTS[coerceChatMode(mode)];
}
