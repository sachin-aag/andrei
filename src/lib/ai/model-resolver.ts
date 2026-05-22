import type { LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { createOpenAI } from "@ai-sdk/openai";

/**
 * Specifies which provider SDK to use and the model identifier within it.
 */
export type ModelSpec = {
  /** Which AI SDK provider package to use. */
  provider: "google" | "vertex" | "openai";
  /** Model identifier passed to the provider, e.g. "gemini-3.1-flash-lite", "claude-sonnet-4", "gpt-4.1". */
  modelId: string;
  /** Temperature for generation calls. */
  temperature: number;
  /** Fixed seed for reproducibility (provider support varies). */
  seed?: number;
};

/**
 * Default model spec matching the existing behaviour of the bulk eval script.
 */
export const DEFAULT_MODEL_SPEC: ModelSpec = {
  provider: "google",
  modelId: "gemini-3.1-flash-lite",
  temperature: 0,
  seed: 0,
};

/**
 * Resolve a concrete `LanguageModel` from a provider-agnostic `ModelSpec`.
 *
 * - `google` → `@ai-sdk/google` using `GOOGLE_GENERATIVE_AI_API_KEY` (or `AI_GATEWAY_API_KEY`)
 * - `vertex` → `@ai-sdk/google-vertex` using Application Default Credentials + project/location env vars
 * - `openai` → `@ai-sdk/openai` using `OPENAI_API_KEY`
 */
export function resolveModelFromSpec(spec: ModelSpec): LanguageModel {
  switch (spec.provider) {
    case "google": {
      const apiKey =
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        process.env.AI_GATEWAY_API_KEY;
      if (!apiKey) {
        throw new Error(
          "No Gemini API key configured. Set GOOGLE_GENERATIVE_AI_API_KEY (or AI_GATEWAY_API_KEY) in .env.local."
        );
      }
      const google = createGoogleGenerativeAI({ apiKey });
      return google(spec.modelId);
    }

    case "vertex": {
      const project = process.env.GOOGLE_VERTEX_PROJECT;
      const location = process.env.GOOGLE_VERTEX_LOCATION ?? "us-central1";
      if (!project) {
        throw new Error(
          "GOOGLE_VERTEX_PROJECT must be set for the vertex provider. Set it in .env.local."
        );
      }
      const vertex = createVertex({ project, location });
      return vertex(spec.modelId);
    }

    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "OPENAI_API_KEY must be set for the openai provider. Set it in .env.local."
        );
      }
      const openai = createOpenAI({ apiKey });
      return openai(spec.modelId);
    }

    default:
      throw new Error(`Unknown provider: ${(spec as ModelSpec).provider}`);
  }
}
