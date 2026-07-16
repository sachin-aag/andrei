import type { LanguageModel } from "ai";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";

/**
 * Orchestrator model for the report drafting chat. Kept on the fast flash-lite
 * tier so the tool loop (read → propose → repair) stays responsive; heavier
 * generation would be delegated inside tools in later tiers.
 */
export const CHAT_GOOGLE_MODEL_ID = "gemini-3.1-flash-lite" as const;

/** Gemini 3.x is only served from the Vertex `global` location. */
const CHAT_VERTEX_LOCATION = "global" as const;

export function resolveChatLanguageModel(): LanguageModel {
  return resolveGoogleLanguageModel(CHAT_GOOGLE_MODEL_ID, {
    vertexLocation: CHAT_VERTEX_LOCATION,
  });
}
