import type { LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { EvalEffort } from "./eval-generation-options";

/** Supported eval model backends. */
export type ModelProvider =
  | "google"
  | "vertex"
  | "vertex-anthropic"
  | "openai";

export const MODEL_PROVIDERS: readonly ModelProvider[] = [
  "google",
  "vertex",
  "vertex-anthropic",
  "openai",
];

/**
 * Specifies which provider SDK to use and the model identifier within it.
 */
export type ModelSpec = {
  /** Which AI SDK provider package to use. */
  provider: ModelProvider;
  /**
   * Model identifier passed to the provider.
   * - google / vertex: e.g. `gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`
   *   (Vertex Gemini 3.x flash models use `global` — there is no `gemini-3.1-flash` id)
   * - vertex-anthropic: Vertex Claude id, e.g. `claude-sonnet-4@20250514`
   * - openai: e.g. `gpt-4.1`
   */
  modelId: string;
  /** Temperature for generation calls (omitted for Vertex Anthropic — not supported). */
  temperature?: number;
  /** Fixed seed for reproducibility (provider support varies). */
  seed?: number;
  /**
   * Thinking / reasoning depth. `none` (default) omits provider thinking config.
   * Google / Vertex Gemini: `thinkingConfig.thinkingLevel` (Gemini 3+).
   * OpenAI: `reasoningEffort` (`minimal` → `low`).
   * Vertex Anthropic: not mapped yet (ignored).
   */
  effort?: EvalEffort;
  /** Optional Vertex region override (defaults differ by provider — see env vars). */
  location?: string;
};

/**
 * Default model spec matching the existing behaviour of the bulk eval script.
 */
export const DEFAULT_MODEL_SPEC: ModelSpec = {
  provider: "google",
  modelId: "gemini-3.1-flash-lite",
  temperature: 0,
  seed: 0,
  effort: "none",
};

export function readVertexProject(): string {
  const project = process.env.GOOGLE_VERTEX_PROJECT?.trim();
  if (!project) {
    throw new Error(
      "GOOGLE_VERTEX_PROJECT must be set for Vertex providers. Add it to .env.local."
    );
  }
  return project;
}

/** Default region for Gemini and other Google models on Vertex. */
export function resolveVertexGeminiLocation(override?: string): string {
  return (
    override?.trim() ||
    process.env.GOOGLE_VERTEX_LOCATION?.trim() ||
    "us-central1"
  );
}

/** Default region for Claude on Vertex (often `us-east5`). */
export function resolveVertexAnthropicLocation(override?: string): string {
  return (
    override?.trim() ||
    process.env.GOOGLE_VERTEX_ANTHROPIC_LOCATION?.trim() ||
    process.env.GOOGLE_VERTEX_LOCATION?.trim() ||
    "us-east5"
  );
}

/**
 * Resolve a concrete `LanguageModel` from a provider-agnostic `ModelSpec`.
 *
 * - `google` → `@ai-sdk/google` using `GOOGLE_GENERATIVE_AI_API_KEY` (or `AI_GATEWAY_API_KEY`)
 * - `vertex` → `@ai-sdk/google-vertex` Gemini / Google models (ADC + project + location)
 * - `vertex-anthropic` → `@ai-sdk/google-vertex/anthropic` Claude on Vertex
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
      const project = readVertexProject();
      const location = resolveVertexGeminiLocation(spec.location);
      const vertex = createVertex({ project, location });
      return vertex(spec.modelId);
    }

    case "vertex-anthropic": {
      const project = readVertexProject();
      const location = resolveVertexAnthropicLocation(spec.location);
      const vertexAnthropic = createVertexAnthropic({ project, location });
      return vertexAnthropic(spec.modelId);
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
