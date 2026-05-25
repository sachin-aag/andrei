import { generateText, Output, type LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { SectionType, CriterionStatus } from "@/db/schema";
import { getCriteria } from "./criteria";
import {
  buildEvalGenerationSettings,
  DEFAULT_EVAL_GENERATION_OPTIONS,
  describeEvalGenerationConfig,
  modelSkipsSamplingControls,
  type EvalGenerationOptions,
} from "@/lib/eval/eval-generation-options";
import { contextForPrompt } from "./section-context";
import { buildEvaluationSystemPrompt } from "./section-prompts";
import { EDITABLE_SECTIONS } from "@/types/sections";

export { PROMPT_VERSION } from "./section-prompts";

/** Google Generative AI model slug passed through `@ai-sdk/google`. */
export const CRITERIA_EVAL_GOOGLE_MODEL_ID = "gemini-3.1-flash-lite" as const;

/** Temperature applied to criterion-level `evaluateSection` calls (in-app default). */
export const CRITERIA_EVAL_TEMPERATURE = DEFAULT_EVAL_GENERATION_OPTIONS.temperature;

/** Fixed seed for reproducible sampling across runs (in-app default). */
export const CRITERIA_EVAL_SEED = DEFAULT_EVAL_GENERATION_OPTIONS.seed ?? 0;

const evaluationSchemaDescription =
  'Output.object with Zod array "evaluations" (criterionKey, status, reasoning).';

export function resolveEvaluationLanguageModel(): LanguageModel {
  const googleKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.AI_GATEWAY_API_KEY;
  if (!googleKey) {
    throw new Error(
      "No Gemini API key configured. Set GOOGLE_GENERATIVE_AI_API_KEY (or AI_GATEWAY_API_KEY) in .env.local."
    );
  }
  const google = createGoogleGenerativeAI({ apiKey: googleKey });
  return google(CRITERIA_EVAL_GOOGLE_MODEL_ID);
}

function resolveModel(): LanguageModel {
  return resolveEvaluationLanguageModel();
}

const evaluationSchema = z.object({
  evaluations: z.array(
    z.object({
      criterionKey: z.string(),
      status: z.enum(["met", "partially_met", "not_met"]),
      reasoning: z.string().min(1).max(1200),
    })
  ),
});

function generationSettingsForSection(
  providerHint?: string,
  generationOptions: EvalGenerationOptions = DEFAULT_EVAL_GENERATION_OPTIONS,
  modelId?: string
) {
  return buildEvalGenerationSettings({
    providerHint,
    modelId,
    ...generationOptions,
    effort: generationOptions.effort ?? "none",
  });
}

export function describeCriterionEvaluationLlmFootprint(
  overrides?: Partial<EvalGenerationOptions> & {
    providerHint?: string;
    modelId?: string;
  }
): {
  criterionModelId: string;
  criterionProvider: string;
  criterionTemperature: number | undefined;
  criterionSeed: number | undefined;
  criterionEffort: string;
  criterionStructuredOutput: string;
  criterionGenerationConfig: string;
} {
  const skipSampling = modelSkipsSamplingControls(
    overrides?.providerHint,
    overrides?.modelId
  );
  const options: EvalGenerationOptions = {
    ...(skipSampling
      ? overrides?.temperature !== undefined
        ? { temperature: overrides.temperature }
        : {}
      : { temperature: overrides?.temperature ?? CRITERIA_EVAL_TEMPERATURE }),
    ...(skipSampling
      ? overrides?.seed !== undefined
        ? { seed: overrides.seed }
        : {}
      : { seed: overrides?.seed ?? CRITERIA_EVAL_SEED }),
    effort: overrides?.effort ?? "none",
  };
  return {
    criterionModelId: CRITERIA_EVAL_GOOGLE_MODEL_ID,
    criterionProvider:
      "@ai-sdk/google · Vercel AI SDK generateText (`ai` package) + structured output (`Output.object`)",
    criterionTemperature: options.temperature,
    criterionSeed: options.seed,
    criterionEffort: options.effort ?? "none",
    criterionStructuredOutput: evaluationSchemaDescription,
    criterionGenerationConfig: describeEvalGenerationConfig(
      options,
      overrides?.providerHint,
      overrides?.modelId
    ),
  };
}

type RawEvaluation = {
  criterionKey: string;
  status: string;
  reasoning: string;
};

/** Parse raw JSON text and extract evaluations, dropping malformed entries. */
function salvageEvaluations(
  section: string,
  text: string,
  finishReason: string
): RawEvaluation[] {
  let raw: { evaluations?: Array<Record<string, unknown>> };
  try {
    raw = JSON.parse(text) as typeof raw;
  } catch {
    throw new Error(
      `Failed to parse model response for ${section}. ` +
        `finishReason: ${finishReason}, text length: ${text.length}`
    );
  }
  if (!Array.isArray(raw.evaluations) || raw.evaluations.length === 0) {
    throw new Error(
      `No evaluations in model response for ${section}. ` +
        `finishReason: ${finishReason}`
    );
  }
  console.warn(
    `[evaluate] Schema validation failed for ${section}, ` +
      `salvaging ${raw.evaluations.length} evaluations from raw response`
  );
  return raw.evaluations.map((e) => ({
    criterionKey: typeof e.criterionKey === "string" ? e.criterionKey : "",
    status: typeof e.status === "string" ? e.status : "not_met",
    reasoning: typeof e.reasoning === "string" ? e.reasoning : "",
  }));
}

export type CriterionEvaluationResult = {
  criterionKey: string;
  criterionLabel: string;
  status: CriterionStatus;
  reasoning: string;
};

/** Exact `system` + `prompt` passed to `generateText` for a sectional evaluation, when an LLM call is made. */
export type CriterionEvaluationLlmPrompts = {
  systemPrompt: string;
  userPrompt: string;
};

function sectionContentForPrompt(section: SectionType, content: unknown): string {
  return typeof content === "string" ? content : contextForPrompt(section, content);
}

export { sectionContentForPrompt };

/**
 * Map of section type → content for all sections in a report.
 * Used to build cumulative prior-section context in the user prompt.
 */
export type AllSectionsContent = Partial<Record<SectionType, unknown>>;

/**
 * Returns the DMAIC sections that precede `section` in report order.
 * Define has no prior sections; Measure gets [define]; Analyze gets [define, measure]; etc.
 */
function priorSections(section: SectionType): SectionType[] {
  const idx = EDITABLE_SECTIONS.indexOf(section as (typeof EDITABLE_SECTIONS)[number]);
  if (idx <= 0) return [];
  return EDITABLE_SECTIONS.slice(0, idx) as unknown as SectionType[];
}

/**
 * Builds a PRIOR SECTIONS CONTEXT block from all preceding sections' content.
 * Returns empty string if no prior sections have meaningful content.
 */
function buildPriorSectionsBlock(
  section: SectionType,
  allSections?: AllSectionsContent
): string {
  if (!allSections) return "";
  const prior = priorSections(section);
  if (prior.length === 0) return "";

  const blocks: string[] = [];
  for (const ps of prior) {
    const content = allSections[ps];
    if (!content) continue;
    const text = sectionContentForPrompt(ps, content);
    if (!text || text.trim() === "" || text === "{}") continue;
    blocks.push(`[${ps.toUpperCase()}]\n${text}`);
  }
  if (blocks.length === 0) return "";

  return `\nPRIOR SECTIONS (read-only context — do NOT evaluate these, only use them to inform your judgment of the current section):\n"""\n${blocks.join("\n\n")}\n"""`;
}

/**
 * Builds the same strings `evaluateSection` sends to the model. Returns `null`
 * when no request is made (no criteria for section, or empty section content).
 *
 * When `allSections` is provided, prior sections' content is included as
 * read-only context so the model can make cross-section judgments (e.g.
 * whether Improve actions trace back to Analyze root causes).
 */
export function buildCriterionEvaluationLlmPrompts({
  section,
  content,
  reportContext,
  allSections,
}: {
  section: SectionType;
  content: unknown;
  reportContext: {
    deviationNo: string;
    date: Date | string;
  };
  allSections?: AllSectionsContent;
}): CriterionEvaluationLlmPrompts | null {
  const criteria = getCriteria(section);
  if (criteria.length === 0) return null;

  const contentStr = sectionContentForPrompt(section, content);

  const isEmpty = !contentStr || contentStr.trim() === "" || contentStr === "{}";

  if (isEmpty) return null;

  const systemPrompt = buildEvaluationSystemPrompt(section);

  const priorBlock = buildPriorSectionsBlock(section, allSections);

  const userPrompt = `DEVIATION: ${reportContext.deviationNo} (report date: ${
    typeof reportContext.date === "string"
      ? reportContext.date
      : reportContext.date.toISOString()
  })

SECTION: ${section.toUpperCase()}

SECTION CONTENT:
"""
${contentStr}
"""${priorBlock}

CRITERIA TO EVALUATE:
${criteria
  .map(
    (c, i) => `${i + 1}. [${c.key}] ${c.label}\n   Guidance: ${c.description}`
  )
  .join("\n")}

Evaluate each criterion using only the section content above. Use the prior sections as background context to inform your judgment (e.g. whether actions trace to root causes), but do not evaluate them. Return one evaluation object per criterion, using the exact criterionKey provided. Do not include suggested fixes or rewritten report text.`;

  return { systemPrompt, userPrompt };
}

export async function evaluateSection({
  section,
  content,
  reportContext,
  allSections,
  model,
  providerHint,
  modelId,
  generationOptions,
}: {
  section: SectionType;
  content: unknown;
  reportContext: {
    deviationNo: string;
    date: Date | string;
  };
  allSections?: AllSectionsContent;
  /** Optional override model — when omitted, uses the default Google Gemini model. */
  model?: LanguageModel;
  /** Provider hint for generation settings (e.g. seed handling). One of "google", "vertex", "openai". */
  providerHint?: string;
  /** Model id for provider-specific generation constraints (e.g. OpenAI reasoning models). */
  modelId?: string;
  /** Temperature, seed, and effort overrides for bulk eval / sweeps. */
  generationOptions?: EvalGenerationOptions;
}): Promise<CriterionEvaluationResult[]> {
  const criteria = getCriteria(section);
  if (criteria.length === 0) return [];

  const prompts = buildCriterionEvaluationLlmPrompts({
    section,
    content,
    reportContext,
    allSections,
  });

  if (!prompts) {
    return criteria.map((c) => ({
      criterionKey: c.key,
      criterionLabel: c.label,
      status: "not_evaluated" as const,
      reasoning: "Section is empty.",
    }));
  }

  const { systemPrompt, userPrompt } = prompts;

  const resolvedModel = model ?? resolveModel();
  const resolvedGenerationOptions = generationOptions ?? DEFAULT_EVAL_GENERATION_OPTIONS;
  const generationSettings = generationSettingsForSection(
    providerHint,
    resolvedGenerationOptions,
    modelId
  );

  let evaluations: Array<{
    criterionKey: string;
    status: string;
    reasoning: string;
  }>;

  try {
    const { temperature, maxOutputTokens, seed, providerOptions } =
      generationSettings;
    const result = await generateText({
      model: resolvedModel,
      output: Output.object({ schema: evaluationSchema }),
      system: systemPrompt,
      prompt: userPrompt,
      ...(temperature !== undefined ? { temperature } : {}),
      maxOutputTokens,
      ...(seed !== undefined ? { seed } : {}),
      ...(providerOptions ? { providerOptions } : {}),
    });

    if (result.experimental_output) {
      evaluations = result.experimental_output.evaluations;
    } else {
      // Output.object() returned null — try salvaging from raw text.
      evaluations = salvageEvaluations(section, result.text, result.finishReason);
    }
  } catch (err: unknown) {
    // generateText + Output.object() throws on schema validation failure
    // rather than returning experimental_output: null.  Extract the raw
    // text from the error and salvage what we can.
    const errText =
      err && typeof err === "object" && "text" in err
        ? String((err as { text: string }).text)
        : "";
    if (!errText) throw err;
    evaluations = salvageEvaluations(section, errText, "error");
  }

  const byKey = new Map(evaluations.map((e) => [e.criterionKey, e]));
  return criteria.map((c) => {
    const result = byKey.get(c.key);
    if (!result) {
      return {
        criterionKey: c.key,
        criterionLabel: c.label,
        status: "not_evaluated" as CriterionStatus,
        reasoning: "No evaluation returned by model.",
      };
    }
    return {
      criterionKey: c.key,
      criterionLabel: c.label,
      status: result.status as CriterionStatus,
      reasoning: result.reasoning,
    };
  });
}
