import { generateObject, type LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { SectionType, CriterionStatus } from "@/db/schema";
import { getCriteria } from "./criteria";

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
      suggestedFix: z.string().max(2000),
    })
  ),
});

export type CriterionEvaluationResult = {
  criterionKey: string;
  criterionLabel: string;
  status: CriterionStatus;
  reasoning: string;
  suggestedFix: string;
};


export async function evaluateSection({
  section,
  content,
  reportContext,
}: {
  section: SectionType;
  content: unknown;
  reportContext: {
    deviationNo: string;
    date: Date | string;
  };
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
      suggestedFix: "",
    }));
  }

  const systemPrompt = `You are a pharmaceutical quality assurance reviewer at M.J. Biopharm Private Limited. You evaluate deviation investigation reports written per SOP/DP/QA/008 using a traffic light system:
- "met": the criterion is clearly and completely addressed.
- "partially_met": the criterion is addressed but with gaps, ambiguity, or missing specifics.
- "not_met": the criterion is missing, unclear, or incorrect.

Always provide a brief reasoning (1-3 sentences). For partially_met or not_met, write a concrete suggestedFix that, if appended or integrated into the section, would resolve the gap. For met, leave suggestedFix as an empty string.

Write suggestedFix in the same tone/voice as a GMP investigation report - factual, precise, and written as prose ready to paste into the section. Do not include labels like "Suggested fix:" in the fix text itself.`;

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

CRITERIA TO EVALUATE:
${criteria
  .map(
    (c, i) => `${i + 1}. [${c.key}] ${c.label}\n   Guidance: ${c.description}`
  )
  .join("\n")}

Evaluate each criterion. Return one evaluation object per criterion, using the exact criterionKey provided.`;

  const { object } = await generateObject({
    model: resolveModel(),
    schema: evaluationSchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.2,
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
        suggestedFix: "",
      };
    }
    return {
      criterionKey: c.key,
      criterionLabel: c.label,
      status: result.status as CriterionStatus,
      reasoning: result.reasoning,
      suggestedFix: result.suggestedFix ?? "",
    };
  });
}
