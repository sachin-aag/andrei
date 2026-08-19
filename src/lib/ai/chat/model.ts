import type { LanguageModel } from "ai";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";

/**
 * Orchestrator model for the report drafting chat. Gemini 3.5 Flash-Lite is
 * the low-latency Flash-Lite for grep + tool loops. Vertex Gemini 3.x is
 * served from `global`.
 */
export const CHAT_GOOGLE_MODEL_ID = "gemini-3.5-flash-lite" as const;

/** Gemini 3.x is only served from the Vertex `global` location. */
const CHAT_VERTEX_LOCATION = "global" as const;

export function resolveChatLanguageModel(): LanguageModel {
  return resolveGoogleLanguageModel(CHAT_GOOGLE_MODEL_ID, {
    vertexLocation: CHAT_VERTEX_LOCATION,
  });
}
