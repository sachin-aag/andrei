import type { LanguageModel } from "ai";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";

/**
 * Orchestrator for the report drafting chat. Gemini 3.7 Flash is the
 * stable Flash for agentic grep + draft loops. Vertex Gemini 3.x is
 * served from `global`.
 */
export const CHAT_GOOGLE_MODEL_ID = "gemini-3.7-flash" as const;

/**
 * Page-extract worker inside document review. Flash-Lite stays on the
 * 8-wide drain so a 62-page walk does not pay Flash on every batch.
 */
export const CHAT_EXTRACT_GOOGLE_MODEL_ID = "gemini-3.5-flash-lite" as const;

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
