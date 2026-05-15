import { generateObject, type LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { SectionType, CriterionStatus } from "@/db/schema";
import { getCriteria } from "./criteria";
import { buildEvaluationSystemPrompt } from "./section-prompts";
import {
  EMPTY_SUGGESTED_FIX,
  coerceLegacyFix,
  modelSuggestedFixSchema,
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
      suggestedFix: modelSuggestedFixSchema,
    })
  ),
});

const HEAVY_REASONING_SECTIONS = new Set<SectionType>([
  "analyze",
  "improve",
  "control",
]);

function generationSettingsForSection(section: SectionType) {
  if (!HEAVY_REASONING_SECTIONS.has(section)) {
    return { maxOutputTokens: 8192 };
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
    typeof content === "string" ? content : JSON.stringify(content, null, 2);

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
Use this context only for drafting suggestedFix wording consistency. Do NOT use it to decide status or reasoning for the current SECTION.`
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
  const { object } = await generateObject({
    model: resolveModel(),
    schema: evaluationSchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.2,
    ...generationSettings,
  });

  const byKey = new Map(object.evaluations.map((e) => [e.criterionKey, e]));
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
