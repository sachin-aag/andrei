import { generateText, Output, type LanguageModel } from "ai";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";
import { z } from "zod";
import type { SectionType, CriterionStatus } from "@/db/schema";
import { getCriteria } from "./criteria";
import { contextForPrompt } from "./section-context";
import { capEvaluationStatusForPlaceholders } from "@/lib/placeholders/evaluation-policy";
import { plainTextHasEvalPlaceholders } from "@/lib/placeholders/placeholder-eval-prompt";
import { collectPlaceholders } from "@/lib/placeholders/scan-sections";
import type { SectionContentMap } from "@/types/sections";
import { cleanSectionContentForEval } from "@/lib/tiptap/strip-pending-suggestions";
import { buildEvaluationSystemPrompt, PROMPT_VERSION } from "./section-prompts";
import { EDITABLE_SECTIONS } from "@/types/sections";
import { langfuseGenerateTextTelemetry } from "@/lib/observability/langfuse";
import {
  buildEvalGenerationSettings,
  describeEvalGenerationConfig,
  modelSkipsSamplingControls,
  DEFAULT_EVAL_GENERATION_OPTIONS,
  type EvalGenerationOptions,
} from "@/lib/eval/eval-generation-options";
import { isTestSkipEvaluation } from "@/lib/test/ai-bypass";
import { getStubCriterionEvaluations } from "@/lib/ai/stub-evaluations";

export { PROMPT_VERSION } from "./section-prompts";

/** Google Generative AI model slug passed through `@ai-sdk/google`. */
export const CRITERIA_EVAL_GOOGLE_MODEL_ID = "gemini-3.1-flash-lite" as const;

/**
 * Gemini 3.x models on Vertex AI are only published in the `global` location
 * (Gemini 2.5 is broadly available, but 3.1-flash-lite returns 404 at
 * us-central1). See https://cloud.google.com/vertex-ai/generative-ai/docs/models.
 */
const CRITERIA_EVAL_VERTEX_LOCATION = "global" as const;

/** Temperature applied to criterion-level `evaluateSection` calls. */
export const CRITERIA_EVAL_TEMPERATURE = 0 as const;

/** Fixed seed for reproducible sampling across runs. */
export const CRITERIA_EVAL_SEED = 0 as const;

const evaluationSchemaDescription =
  'Output.object with Zod array "evaluations" (criterionKey, status, reasoning).';

export function resolveEvaluationLanguageModel(): LanguageModel {
  return resolveGoogleLanguageModel(CRITERIA_EVAL_GOOGLE_MODEL_ID, {
    vertexLocation: CRITERIA_EVAL_VERTEX_LOCATION,
  });
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
    traceGeminiThoughts: true,
    defaultGeminiThinkingLevel: "minimal",
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
    criterionModelId: overrides?.modelId ?? CRITERIA_EVAL_GOOGLE_MODEL_ID,
    criterionProvider:
      "@ai-sdk/google · Vercel AI SDK generateText (`ai` package) + structured output (`Output.object`)",
    criterionTemperature: options.temperature,
    criterionSeed: options.seed,
    criterionEffort: options.effort ?? "none",
    criterionStructuredOutput: evaluationSchemaDescription,
    criterionGenerationConfig: describeEvalGenerationConfig(
      options,
      overrides?.providerHint,
      overrides?.modelId,
      true,
      "minimal"
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

function sectionPlainTextForPrompt(section: SectionType, content: unknown): string {
  const cleaned = cleanSectionContentForEval(section, content);
  return typeof content === "string"
    ? String(cleaned)
    : contextForPrompt(section, cleaned);
}

/** Plain text for the LLM (pending suggestion marks stripped; placeholders unchanged). */
export function sectionContentForPrompt(section: SectionType, content: unknown): string {
  return sectionPlainTextForPrompt(section, content);
}

/** Exported for criteria review seeding and other human-review tooling. */
export function formatSectionContentForEvaluation(
  section: SectionType,
  content: unknown
): string {
  return sectionContentForPrompt(section, content);
}

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

  const rawContentStr = sectionPlainTextForPrompt(section, content);
  const placeholderNote = plainTextHasEvalPlaceholders(rawContentStr)
    ? `\n\nPLACEHOLDER NOTE: SECTION CONTENT includes bracket placeholders the author will fill in later. For this evaluation, treat each [Label: <to be filled>] as if it will contain appropriate factual data matching the label — evaluate whether the right facts are represented in the right places, not whether the bracket text is already a final value. You may note in reasoning that a placeholder still needs completion in the Placeholders panel.`
    : "";

  const userPrompt = `DEVIATION: ${reportContext.deviationNo} (report date: ${
    typeof reportContext.date === "string"
      ? reportContext.date
      : reportContext.date.toISOString()
  })

SECTION: ${section.toUpperCase()}

SECTION CONTENT:
"""
${contentStr}
"""${priorBlock}${placeholderNote}

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
  /** Provider hint for generation settings (e.g. seed handling). */
  providerHint?: string;
  /** Model id for provider-specific generation constraints. */
  modelId?: string;
  /** Temperature, seed, and effort overrides for bulk eval / sweeps. */
  generationOptions?: EvalGenerationOptions;
}): Promise<CriterionEvaluationResult[]> {
  const criteria = getCriteria(section);
  if (criteria.length === 0) return [];

  if (isTestSkipEvaluation()) {
    return getStubCriterionEvaluations(section);
  }

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
    const { temperature, maxOutputTokens, seed, providerOptions } = generationSettings;
    const result = await generateText({
      model: resolvedModel,
      output: Output.object({ schema: evaluationSchema }),
      system: systemPrompt,
      prompt: userPrompt,
      ...(temperature !== undefined ? { temperature } : {}),
      maxOutputTokens,
      ...(seed !== undefined ? { seed } : {}),
      ...(providerOptions ? { providerOptions } : {}),
      ...langfuseGenerateTextTelemetry({
        functionId: "criteria-evaluate-section",
        metadata: {
          feature: "criteria-evaluation",
          section,
          criterionCount: criteria.length,
          model: modelId ?? CRITERIA_EVAL_GOOGLE_MODEL_ID,
          promptVersion: PROMPT_VERSION,
        },
      }),
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
  const hasUnfilledPlaceholders =
    collectPlaceholders({
      [section]: content as SectionContentMap[typeof section],
    }).length > 0;

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
    const status = capEvaluationStatusForPlaceholders(
      result.status as CriterionStatus,
      result.reasoning,
      hasUnfilledPlaceholders
    );
    return {
      criterionKey: c.key,
      criterionLabel: c.label,
      status,
      reasoning: result.reasoning,
    };
  });
}
