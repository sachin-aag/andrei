import { createGatewayProvider } from "@ai-sdk/gateway";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

/** @internal — booleans only, safe for logs */
export function getGeminiAuthDiagnostics(): {
  hasGoogleKey: boolean;
  hasGatewayKey: boolean;
  hasOidcToken: boolean;
  onVercel: boolean;
} {
  return {
    hasGoogleKey: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()),
    hasGatewayKey: Boolean(process.env.AI_GATEWAY_API_KEY?.trim()),
    hasOidcToken: Boolean(process.env.VERCEL_OIDC_TOKEN?.trim()),
    onVercel: Boolean(process.env.VERCEL),
  };
}

let cachedGatewayProvider: ReturnType<typeof createGatewayProvider> | null = null;

function getGatewayProvider() {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (apiKey) {
    return createGatewayProvider({ apiKey });
  }

  cachedGatewayProvider ??= createGatewayProvider();
  return cachedGatewayProvider;
}

/**
 * Resolve a Google Gemini model for server-side AI calls.
 *
 * 1. `GOOGLE_GENERATIVE_AI_API_KEY` — direct Google AI Studio key (@ai-sdk/google)
 * 2. `AI_GATEWAY_API_KEY` — explicit Vercel AI Gateway key (createGatewayProvider)
 * 3. On Vercel — OIDC via default gateway provider when OIDC is enabled for the project
 */
export function resolveGoogleLanguageModel(googleModelId: string): LanguageModel {
  const directKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (directKey) {
    const google = createGoogleGenerativeAI({ apiKey: directKey });
    return google(googleModelId);
  }

  const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
  const oidc = process.env.VERCEL_OIDC_TOKEN?.trim();
  if (gatewayKey || oidc || process.env.VERCEL) {
    return getGatewayProvider()(`google/${googleModelId}`);
  }

  throw new Error(
    "No Gemini credentials configured. Set GOOGLE_GENERATIVE_AI_API_KEY, or AI_GATEWAY_API_KEY, or enable Vercel AI Gateway OIDC for this project."
  );
}
