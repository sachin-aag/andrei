import { generateText, Output, type LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { SectionType, CriterionStatus } from "@/db/schema";
import { getCriteria } from "./criteria";
import { contextForPrompt } from "./section-context";
import { buildEvaluationSystemPrompt } from "./section-prompts";
import {
  EMPTY_SUGGESTED_FIX,
  coerceLegacyFix,
  type SuggestedFix,
} from "./suggested-fix";

export {
  EMPTY_SUGGESTED_FIX,
  coerceLegacyFix,
  hasFixContent,
} from "./suggested-fix";
export type {
  SuggestedFix,
  FieldOp,
  SetFieldOp,
  AppendFieldOp,
  NoneFix,
  PatchFix,
  FieldsFix,
} from "./suggested-fix";

function resolveModel(): LanguageModel {
  const googleKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.AI_GATEWAY_API_KEY;
  if (!googleKey) {
    throw new Error(
      "No Gemini API key configured. Set GOOGLE_GENERATIVE_AI_API_KEY (or AI_GATEWAY_API_KEY) in .env.local."
    );
  }
  const google = createGoogleGenerativeAI({ apiKey: googleKey });
  return google("gemini-2.5-flash");
}

const evaluationSchema = z.object({
  evaluations: z.array(
    z.object({
      criterionKey: z.string(),
      status: z.enum(["met", "partially_met", "not_met"]),
      reasoning: z.string().min(1).max(1200),
      // Intentionally permissive: the prompt describes the desired shape, and
      // coerceLegacyFix() handles coercion/truncation after parsing.  Strict
      // length validation here caused the entire response to be rejected when
      // even one criterion's suggestedFix was oversized.
      suggestedFix: z.unknown(),
    })
  ),
});

const HEAVY_REASONING_SECTIONS = new Set<SectionType>([
  "measure",
  "analyze",
  "improve",
  "control",
]);

function generationSettingsForSection(section: SectionType) {
  if (!HEAVY_REASONING_SECTIONS.has(section)) {
    return {
      maxOutputTokens: 16384,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget: 4096,
            includeThoughts: false,
          },
        },
      },
    };
  }

  return {
    maxOutputTokens: 32768,
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 8192,
          includeThoughts: false,
        },
      },
    },
  };
}

type RawEvaluation = {
  criterionKey: string;
  status: string;
  reasoning: string;
  suggestedFix: unknown;
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
    suggestedFix: e.suggestedFix,
  }));
}

export type CriterionEvaluationResult = {
  criterionKey: string;
  criterionLabel: string;
  status: CriterionStatus;
  reasoning: string;
  suggestedFix: SuggestedFix;
};


export async function evaluateSection({
  section,
  content,
  reportContext,
  previousSections = [],
}: {
  section: SectionType;
  content: unknown;
  reportContext: {
    deviationNo: string;
    date: Date | string;
  };
  previousSections?: Array<{
    section: SectionType;
    content: string;
  }>;
}): Promise<CriterionEvaluationResult[]> {
  const criteria = getCriteria(section);
  if (criteria.length === 0) return [];

  const contentStr =
    typeof content === "string" ? content : contextForPrompt(section, content);

  const isEmpty = !contentStr || contentStr.trim() === "" || contentStr === "{}";

  if (isEmpty) {
    return criteria.map((c) => ({
      criterionKey: c.key,
      criterionLabel: c.label,
      status: "not_evaluated" as const,
      reasoning: "Section is empty.",
      suggestedFix: EMPTY_SUGGESTED_FIX,
    }));
  }

  const systemPrompt = buildEvaluationSystemPrompt(section);

  const userPrompt = `DEVIATION: ${reportContext.deviationNo} (report date: ${
    typeof reportContext.date === "string"
      ? reportContext.date
      : reportContext.date.toISOString()
  })

SECTION: ${section.toUpperCase()}

SECTION CONTENT:
"""
${contentStr}
"""

${
  previousSections.length > 0
    ? `PREVIOUS SECTION CONTEXT (read-only, for consistency only):
${previousSections
  .map(
    (s) =>
      `\n[${s.section.toUpperCase()}]\n"""\n${s.content}\n"""`
  )
  .join("\n")}

Use this context to keep terminology, chronology, and conclusions consistent with earlier sections. Do NOT re-evaluate earlier sections; only evaluate the current SECTION.
Use this context only for drafting suggestedFix wording consistency. Do NOT use it to decide status or reasoning for the current SECTION.
Do NOT copy large blocks of text from previous sections or the current section into your replacementText. Each patch must target only the specific deficient span, not the whole narrative.`
    : ""
}

CRITERIA TO EVALUATE:
${criteria
  .map(
    (c, i) => `${i + 1}. [${c.key}] ${c.label}\n   Guidance: ${c.description}`
  )
  .join("\n")}

Evaluate each criterion. Return one evaluation object per criterion, using the exact criterionKey provided.`;

  const generationSettings = generationSettingsForSection(section);

  let evaluations: Array<{
    criterionKey: string;
    status: string;
    reasoning: string;
    suggestedFix: unknown;
  }>;

  try {
    const result = await generateText({
      model: resolveModel(),
      output: Output.object({ schema: evaluationSchema }),
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.2,
      ...generationSettings,
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
        suggestedFix: EMPTY_SUGGESTED_FIX,
      };
    }
    return {
      criterionKey: c.key,
      criterionLabel: c.label,
      status: result.status as CriterionStatus,
      reasoning: result.reasoning,
      suggestedFix: coerceLegacyFix(result.suggestedFix),
    };
  });
}
