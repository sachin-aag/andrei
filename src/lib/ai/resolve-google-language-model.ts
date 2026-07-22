import { createGatewayProvider } from "@ai-sdk/gateway";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import type { LanguageModel } from "ai";
import { createWifAuthClient, getWifConfig } from "@/lib/gcp/wif-token";

type GoogleAuthOptions = NonNullable<Parameters<typeof createVertex>[0]>["googleAuthOptions"];
type AuthClient = NonNullable<NonNullable<GoogleAuthOptions>["authClient"]>;

/** @internal — booleans only, safe for logs */
export function getGeminiAuthDiagnostics(): {
  hasVertexConfig: boolean;
  vertexProject: string | null;
  vertexLocation: string | null;
  hasWifConfig: boolean;
  hasGoogleKey: boolean;
  hasGatewayKey: boolean;
  hasOidcToken: boolean;
  onVercel: boolean;
} {
  const vertexProject = process.env.GOOGLE_VERTEX_PROJECT?.trim() || null;
  const vertexLocation = process.env.GOOGLE_VERTEX_LOCATION?.trim() || null;
  return {
    hasVertexConfig: Boolean(vertexProject),
    vertexProject,
    vertexLocation,
    hasWifConfig: Boolean(getWifConfig()),
    hasGoogleKey: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()),
    hasGatewayKey: Boolean(process.env.AI_GATEWAY_API_KEY?.trim()),
    hasOidcToken: Boolean(process.env.VERCEL_OIDC_TOKEN?.trim()),
    onVercel: Boolean(process.env.VERCEL),
  };
}

const vertexProviderByLocation = new Map<string, ReturnType<typeof createVertex>>();

/**
 * Build the Vertex provider for a given location. Authentication source
 * depends on environment:
 *
 * - Local dev: ADC from `gcloud auth application-default login`
 * - Vercel: Workload Identity Federation — Vercel's OIDC token is exchanged
 *   via STS for a short-lived service-account access token. Requires
 *   `GCP_WIF_AUDIENCE` and `GCP_SERVICE_ACCOUNT_EMAIL` env vars. The OIDC
 *   token itself is fetched per-request from env or request header.
 *
 * Provider instances are cached per location so callers can mix regions
 * (e.g. `us-central1` for Gemini 2.5, `global` for Gemini 3.x) without
 * recreating auth clients on every call.
 */
function getVertexProvider(location: string) {
  const cached = vertexProviderByLocation.get(location);
  if (cached) return cached;

  const project = process.env.GOOGLE_VERTEX_PROJECT?.trim();
  const wifConfig = getWifConfig();

  const provider =
    wifConfig
      ? createVertex({
          project,
          location,
          googleAuthOptions: {
            authClient: createWifAuthClient(wifConfig) as unknown as AuthClient,
          },
        })
      : // Local dev fallback: ADC via `gcloud auth application-default login`.
        createVertex({ project, location });

  vertexProviderByLocation.set(location, provider);
  return provider;
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

export type ResolveGoogleLanguageModelOptions = {
  /**
   * Override the Vertex AI location for this model. Useful because Gemini
   * model availability varies by region — e.g. the Gemini 3.x family is only
   * served from `global`, while Gemini 2.5 is broadly available.
   *
   * Falls back to `GOOGLE_VERTEX_LOCATION` env var, then `us-central1`.
   * Ignored when not using the Vertex path.
   */
  vertexLocation?: string;
};

/**
 * Resolve a Google Gemini model for server-side AI calls.
 *
 * Priority order:
 * 1. `GOOGLE_VERTEX_PROJECT` set → Vertex AI (uses GCP credits, no API key).
 *    Auth source depends on env: WIF on Vercel when `GCP_WIF_AUDIENCE` +
 *    `GCP_SERVICE_ACCOUNT_EMAIL` are set, otherwise ADC for local dev.
 * 2. `GOOGLE_GENERATIVE_AI_API_KEY` → direct AI Studio key
 * 3. `AI_GATEWAY_API_KEY` → explicit Vercel AI Gateway key
 * 4. On Vercel → OIDC via default gateway provider
 */
export function resolveGoogleLanguageModel(
  googleModelId: string,
  options: ResolveGoogleLanguageModelOptions = {}
): LanguageModel {
  const vertexProject = process.env.GOOGLE_VERTEX_PROJECT?.trim();
  if (vertexProject) {
    const location =
      options.vertexLocation ??
      process.env.GOOGLE_VERTEX_LOCATION?.trim() ??
      "us-central1";
    return getVertexProvider(location)(googleModelId);
  }

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
    "No Gemini credentials configured. Set GOOGLE_VERTEX_PROJECT (with ADC via `gcloud auth application-default login`), GOOGLE_GENERATIVE_AI_API_KEY, AI_GATEWAY_API_KEY, or enable Vercel AI Gateway OIDC."
  );
}
