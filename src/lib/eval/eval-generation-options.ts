import type { ModelSpec } from "./model-resolver";

/** Reasoning / thinking depth for eval runs. `none` = omit thinking config (default). */
export const EVAL_EFFORT_LEVELS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
] as const;

export type EvalEffort = (typeof EVAL_EFFORT_LEVELS)[number];

export type EvalGenerationOptions = {
  temperature?: number;
  seed?: number;
  effort?: EvalEffort;
};

export const DEFAULT_EVAL_GENERATION_OPTIONS: EvalGenerationOptions = {
  temperature: 0,
  seed: 0,
  effort: "none",
};

export function parseEvalEffort(value: string): EvalEffort {
  if ((EVAL_EFFORT_LEVELS as readonly string[]).includes(value)) {
    return value as EvalEffort;
  }
  throw new Error(
    `Invalid effort "${value}". Expected one of: ${EVAL_EFFORT_LEVELS.join(", ")}`
  );
}

export function modelSpecToGenerationOptions(
  spec: Pick<ModelSpec, "provider" | "modelId" | "temperature" | "seed" | "effort">
): EvalGenerationOptions {
  const skipSampling = modelSkipsSamplingControls(spec.provider, spec.modelId);
  return {
    ...(spec.temperature !== undefined && !skipSampling
      ? { temperature: spec.temperature }
      : {}),
    ...(spec.seed !== undefined && !skipSampling ? { seed: spec.seed } : {}),
    effort: spec.effort ?? "none",
  };
}

/** Stable label for compare reports — includes settings that change model behavior. */
export function formatModelRunLabel(
  spec: Pick<
    ModelSpec,
    "provider" | "modelId" | "temperature" | "seed" | "effort" | "location"
  >
): string {
  const parts = [`${spec.provider}/${spec.modelId}`];
  if (spec.location) {
    parts.push(`loc=${spec.location}`);
  }
  if (
    spec.temperature !== undefined &&
    spec.temperature !== DEFAULT_EVAL_GENERATION_OPTIONS.temperature
  ) {
    parts.push(`temp=${spec.temperature}`);
  }
  const effort = spec.effort ?? "none";
  if (effort !== "none") {
    parts.push(`effort=${effort}`);
  }
  if (spec.seed !== undefined && spec.seed !== DEFAULT_EVAL_GENERATION_OPTIONS.seed) {
    parts.push(`seed=${spec.seed}`);
  }
  return parts.join("@");
}

type BuildEvalGenerationSettingsArgs = EvalGenerationOptions & {
  providerHint?: string;
  modelId?: string;
  traceGeminiThoughts?: boolean;
  defaultGeminiThinkingLevel?: Exclude<EvalEffort, "none">;
};

type GeminiThinkingConfig = {
  thinkingLevel: Exclude<EvalEffort, "none">;
  includeThoughts: boolean;
};

type GeminiProviderOptions = {
  seed?: number;
  thinkingConfig?: GeminiThinkingConfig;
};

type GenerationProviderOptions = {
  google?: GeminiProviderOptions;
  vertex?: GeminiProviderOptions;
  openai?: {
    reasoningEffort: "low" | "medium" | "high";
  };
};

/** Models that reject temperature (and usually seed) in the AI SDK. */
export function modelSkipsSamplingControls(
  provider?: string,
  modelId?: string
): boolean {
  if (provider === "vertex-anthropic") return true;
  if (provider === "openai" && modelId) {
    const id = modelId.trim().toLowerCase();
    return /^gpt-5(\.|$|-)/.test(id) || /^o\d/.test(id);
  }
  return false;
}

function usesGoogleThinkingConfig(providerHint?: string): boolean {
  return (
    !providerHint ||
    providerHint === "google" ||
    providerHint === "vertex"
  );
}

function geminiProviderNamespaces(providerHint?: string): Array<"google" | "vertex"> {
  if (providerHint === "google") return ["google"];
  if (providerHint === "vertex") return ["vertex"];
  if (!providerHint) return ["google", "vertex"];
  return [];
}

export function buildGeminiThoughtSummaryProviderOptions({
  providerHint,
  seed,
  thinkingLevel,
}: {
  providerHint?: string;
  seed?: number;
  thinkingLevel: Exclude<EvalEffort, "none">;
}): Pick<GenerationProviderOptions, "google" | "vertex"> {
  const providerOptions: Pick<GenerationProviderOptions, "google" | "vertex"> = {};
  for (const namespace of geminiProviderNamespaces(providerHint)) {
    providerOptions[namespace] = {
      ...(seed !== undefined ? { seed } : {}),
      thinkingConfig: {
        thinkingLevel,
        includeThoughts: true,
      },
    };
  }
  return providerOptions;
}

/**
 * Maps unified `effort` to provider-specific thinking / reasoning options.
 * Thought summaries are opt-in so bulk model sweeps can keep their previous
 * output shape unless a traced app call explicitly requests them.
 */
export function buildEvalGenerationSettings({
  providerHint,
  modelId,
  temperature,
  seed,
  effort = "none",
  traceGeminiThoughts = false,
  defaultGeminiThinkingLevel = "minimal",
}: BuildEvalGenerationSettingsArgs): {
  temperature?: number;
  maxOutputTokens: number;
  seed?: number;
  providerOptions?: GenerationProviderOptions;
} {
  const base: {
    temperature?: number;
    maxOutputTokens: number;
    seed?: number;
    providerOptions?: GenerationProviderOptions;
  } = {
    maxOutputTokens: 32768,
  };

  const skipSampling = modelSkipsSamplingControls(providerHint, modelId);

  if (!skipSampling && temperature !== undefined) {
    base.temperature = temperature;
  }

  const providerOptions: GenerationProviderOptions = {};

  if (
    !skipSampling &&
    seed !== undefined &&
    usesGoogleThinkingConfig(providerHint)
  ) {
    if (providerHint === "vertex") {
      providerOptions.vertex = { seed };
    } else {
      providerOptions.google = { seed };
    }
  }

  if (!skipSampling && providerHint === "openai" && seed !== undefined) {
    base.seed = seed;
  }

  if (effort !== "none") {
    if (providerHint === "openai") {
      const reasoningEffort: "low" | "medium" | "high" =
        effort === "minimal" ? "low" : effort;
      providerOptions.openai = { reasoningEffort };
    } else if (providerHint === "vertex-anthropic") {
      // Claude on Vertex: effort not mapped (no thinkingConfig on this path).
    } else if (providerHint === "vertex") {
      providerOptions.vertex = {
        ...providerOptions.vertex,
        thinkingConfig: {
          thinkingLevel: effort,
          includeThoughts: traceGeminiThoughts,
        },
      };
    } else {
      providerOptions.google = {
        ...providerOptions.google,
        thinkingConfig: {
          thinkingLevel: effort,
          includeThoughts: traceGeminiThoughts,
        },
      };
    }
  } else if (traceGeminiThoughts && usesGoogleThinkingConfig(providerHint)) {
    Object.assign(
      providerOptions,
      buildGeminiThoughtSummaryProviderOptions({
        providerHint,
        seed,
        thinkingLevel: defaultGeminiThinkingLevel,
      })
    );
  }

  if (Object.keys(providerOptions).length > 0) {
    base.providerOptions = providerOptions;
  }

  return {
    ...(base.temperature !== undefined ? { temperature: base.temperature } : {}),
    maxOutputTokens: base.maxOutputTokens,
    ...(base.seed !== undefined ? { seed: base.seed } : {}),
    ...(base.providerOptions ? { providerOptions: base.providerOptions } : {}),
  };
}

export function describeEvalGenerationConfig(
  options: EvalGenerationOptions,
  providerHint?: string,
  modelId?: string,
  traceGeminiThoughts = false,
  defaultGeminiThinkingLevel: Exclude<EvalEffort, "none"> = "minimal"
): string {
  const parts = [`maxOutputTokens=32768`];
  if (modelSkipsSamplingControls(providerHint, modelId)) {
    parts.push("temperature=omitted (not supported)");
  } else {
    parts.push(`temperature=${options.temperature ?? DEFAULT_EVAL_GENERATION_OPTIONS.temperature}`);
  }
  if (
    !modelSkipsSamplingControls(providerHint, modelId) &&
    options.seed !== undefined &&
    usesGoogleThinkingConfig(providerHint)
  ) {
    parts.push(`seed=${options.seed}`);
  }
  if (
    !modelSkipsSamplingControls(providerHint, modelId) &&
    providerHint === "openai" &&
    options.seed !== undefined
  ) {
    parts.push(`openai.seed=${options.seed}`);
  }
  const effort = options.effort ?? "none";
  if (effort === "none") {
    if (traceGeminiThoughts && usesGoogleThinkingConfig(providerHint)) {
      parts.push(
        `thinkingLevel=${defaultGeminiThinkingLevel}; includeThoughts=true`
      );
    } else {
      parts.push("effort=none (no thinkingConfig)");
    }
  } else if (providerHint === "openai") {
    parts.push(`reasoningEffort=${effort === "minimal" ? "low" : effort}`);
  } else if (providerHint === "vertex-anthropic") {
    parts.push(`effort=${effort} (ignored for Vertex Anthropic today)`);
  } else {
    parts.push(
      `thinkingLevel=${effort}; includeThoughts=${traceGeminiThoughts}`
    );
  }
  return parts.join("; ");
}
