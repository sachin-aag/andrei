import type { LanguageModel } from "ai";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";
import type { ChatMessageTarget } from "@/lib/ai/chat/message-target";
import type { ChatMode } from "@/lib/ai/chat/system-prompt";
import { DEFAULT_CHAT_PACE, type ChatPace } from "@/lib/ai/chat/pace";
import type { EvalEffort } from "@/lib/eval/eval-generation-options";

/**
 * Quick. Flash-Lite answers lookups and short edits without paying
 * orchestrator thinking on every step.
 */
export const CHAT_QUICK_GOOGLE_MODEL_ID = "gemini-3.5-flash-lite" as const;

/**
 * Deep. Gemini 3.7 Flash is the stable Flash for agentic grep + draft loops.
 * Vertex Gemini 3.x is served from `global`.
 */
export const CHAT_DEEP_GOOGLE_MODEL_ID = "gemini-3.7-flash" as const;

/**
 * Page-extract worker inside document review. Flash-Lite stays on the
 * 8-wide drain so a 62-page walk does not pay Flash on every batch.
 */
export const CHAT_EXTRACT_GOOGLE_MODEL_ID = "gemini-3.5-flash-lite" as const;

export type ChatPaceConfig = {
  modelId: string;
  thinkingLevel: Exclude<EvalEffort, "none">;
};

/**
 * Model and thinking level are one choice, not two knobs: 3.7 Flash rejects
 * `THINKING_LEVEL_MINIMAL` (Vertex 400), and Flash-Lite has no reason to pay
 * for more. Omit temperature / topP / seed — Gemini 3.x should keep sampling
 * defaults.
 * @see https://ai.google.dev/gemini-api/docs
 */
const CHAT_PACE_CONFIG = {
  quick: { modelId: CHAT_QUICK_GOOGLE_MODEL_ID, thinkingLevel: "minimal" },
  deep: { modelId: CHAT_DEEP_GOOGLE_MODEL_ID, thinkingLevel: "medium" },
} as const satisfies Record<ChatPace, ChatPaceConfig>;

export function chatPaceConfig(pace: ChatPace): ChatPaceConfig {
  return CHAT_PACE_CONFIG[pace];
}

/** Gemini 3.x is only served from the Vertex `global` location. */
const CHAT_VERTEX_LOCATION = "global" as const;

export function resolveChatLanguageModel(
  pace: ChatPace = DEFAULT_CHAT_PACE
): LanguageModel {
  return resolveGoogleLanguageModel(chatPaceConfig(pace).modelId, {
    vertexLocation: CHAT_VERTEX_LOCATION,
  });
}

export function resolveChatExtractLanguageModel(): LanguageModel {
  return resolveGoogleLanguageModel(CHAT_EXTRACT_GOOGLE_MODEL_ID, {
    vertexLocation: CHAT_VERTEX_LOCATION,
  });
}

export type ChatTurnChangeSummary = {
  items: Array<{
    section: string;
    targetField: string;
    reasoning: string;
  }>;
  revisionNo?: number;
};

/**
 * Stored on every assistant row in `chat_messages.metadata`. Users pick a
 * pace, not a model, so this is the only place a past reply can be traced
 * back to what wrote it — which matters when someone asks why the assistant
 * answered differently two months ago. `chatTarget` is which work-product
 * the turn was sent to (Report vs Analytics) so mixed threads stay readable.
 */
export type ChatAssistantTurnMetadata = ChatPaceConfig & {
  pace: ChatPace;
  mode: ChatMode;
  promptVersion: string;
  chatTarget: ChatMessageTarget;
  changeSummary?: ChatTurnChangeSummary;
};

export function chatAssistantTurnMetadata(input: {
  pace: ChatPace;
  mode: ChatMode;
  promptVersion: string;
  chatTarget: ChatMessageTarget;
  changeSummary?: ChatTurnChangeSummary;
}): ChatAssistantTurnMetadata {
  const { changeSummary, ...rest } = input;
  return {
    ...chatPaceConfig(input.pace),
    ...rest,
    ...(changeSummary && changeSummary.items.length > 0
      ? { changeSummary }
      : {}),
  };
}
