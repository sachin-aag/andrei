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

export const ANALYTICS_EXAMPLE_PROMPTS: Record<ChatMode, string[]> = {
  plan: [
    "Where is TABLE NO. 01 for the 60 L fermenter in the Seed-2 BMRs?",
    "What assay LSL and USL are named in the attachments?",
    "Summarize the worksheet columns and any saved sixpacks.",
  ],
  agent: [
    "Extract assay measurements from the attachments into a worksheet column.",
    "Run a Normal Capability Sixpack on the Assay column with LSL 90 and USL 110.",
    "Run one-way ANOVA of Assay by Lot.",
    "Plot measurements for M3-SYS-FN-037 from the attachments.",
    "Plot OD660 vs Cumulative Glucose from the worksheet.",
  ],
};

/** Empty-state chips. Invalid mode (Radix "" after a remount) must not throw. */
export function examplePromptsForMode(mode: unknown): string[] {
  return EXAMPLE_PROMPTS[coerceChatMode(mode)];
}

export function analyticsExamplePromptsForMode(mode: unknown): string[] {
  return ANALYTICS_EXAMPLE_PROMPTS[coerceChatMode(mode)];
}
