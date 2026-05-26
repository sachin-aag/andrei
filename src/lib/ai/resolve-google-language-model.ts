import { gateway } from "@ai-sdk/gateway";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

/**
 * Resolve a Google Gemini model for server-side AI calls.
 *
 * Prefer a direct `GOOGLE_GENERATIVE_AI_API_KEY` when set. Otherwise route through
 * the Vercel AI Gateway (`AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` on deploy).
 *
 * Do not pass `AI_GATEWAY_API_KEY` to `@ai-sdk/google` — that provider expects a
 * Google API key and will fail at runtime on production when only the gateway key
 * is configured.
 */
export function resolveGoogleLanguageModel(googleModelId: string): LanguageModel {
  const directKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (directKey) {
    const google = createGoogleGenerativeAI({ apiKey: directKey });
    return google(googleModelId);
  }

  const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
  const oidc = process.env.VERCEL_OIDC_TOKEN?.trim();
  if (gatewayKey || oidc) {
    return gateway(`google/${googleModelId}`);
  }

  throw new Error(
    "No Gemini credentials configured. Set GOOGLE_GENERATIVE_AI_API_KEY, or enable the Vercel AI Gateway (AI_GATEWAY_API_KEY / OIDC) for this environment."
  );
}
