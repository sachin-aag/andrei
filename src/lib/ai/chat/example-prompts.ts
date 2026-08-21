import { coerceChatMode } from "@/lib/ai/chat/composer-prefs";
import type { ChatMode } from "@/lib/ai/chat/system-prompt";

export const EXAMPLE_PROMPTS: Record<ChatMode, string[]> = {
  plan: [
    "Help me document this deviation from scratch.",
    "What do you need to complete the Define section?",
    "Plan an investigation for an out-of-spec result on a medical device line.",
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
