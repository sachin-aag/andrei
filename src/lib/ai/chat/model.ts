import type { LanguageModel } from "ai";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";

/**
 * Orchestrator for the report drafting chat. Gemini 3.5 Flash-Lite is the
 * latency/cost Flash for agentic grep + draft loops. Vertex Gemini 3.x is
 * served from `global`.
 * @see https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
 */
export const CHAT_GOOGLE_MODEL_ID = "gemini-3.5-flash-lite" as const;

/**
 * Page-extract worker inside document review. Same Flash-Lite family as the
 * orchestrator, with `minimal` thinking, so a 62-page drain stays cheap.
 */
export const CHAT_EXTRACT_GOOGLE_MODEL_ID = "gemini-3.5-flash-lite" as const;

/**
 * Fixed thinking for the orchestrator until we route by task. 3.5 Flash-Lite
 * defaults to `minimal`, which Google warns can end multi-step tool use
 * early. Keep `low` on the grep + draft loop. Omit temperature / topP / seed.
 * @see https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
 */
export const CHAT_THINKING_LEVEL = "low" as const;

/** Gemini 3.x is only served from the Vertex `global` location. */
const CHAT_VERTEX_LOCATION = "global" as const;

export function resolveChatLanguageModel(): LanguageModel {
  return resolveGoogleLanguageModel(CHAT_GOOGLE_MODEL_ID, {
    vertexLocation: CHAT_VERTEX_LOCATION,
  });
}

export function resolveChatExtractLanguageModel(): LanguageModel {
  return resolveGoogleLanguageModel(CHAT_EXTRACT_GOOGLE_MODEL_ID, {
    vertexLocation: CHAT_VERTEX_LOCATION,
  });
}
