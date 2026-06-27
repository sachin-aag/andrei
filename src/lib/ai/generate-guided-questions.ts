import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";
import { langfuseGenerateTextTelemetry } from "@/lib/observability/langfuse";
import { CRITERIA_BY_SECTION } from "@/lib/ai/criteria";
import { EDITABLE_SECTIONS } from "@/types/sections";

const GUIDED_QUESTIONS_MODEL_ID = "gemini-3.1-flash-lite" as const;
const GUIDED_QUESTIONS_VERTEX_LOCATION = "global" as const;

export const generatedQuestionSchema = z.object({
  id: z.string(),
  section: z.enum(["define", "measure", "analyze", "improve", "control"]),
  criteriaKeys: z.array(z.string()),
  label: z.string(),
  description: z.string().optional(),
  inputType: z.enum(["text", "textarea", "choice"]),
  options: z.array(z.string()).optional(),
  required: z.boolean(),
});

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

const questionsResponseSchema = z.object({
  questions: z.array(generatedQuestionSchema),
});

/** All valid criterion keys for post-generation validation. */
const ALL_CRITERION_KEYS = new Set(
  EDITABLE_SECTIONS.flatMap((section) =>
    (CRITERIA_BY_SECTION[section] ?? []).map((c) => c.key)
  )
);

export async function generateGuidedQuestions({
  deviationNo,
  sectionContent,
  existingEvaluations,
}: {
  deviationNo: string;
  /** Plain-text representation of each section's current content. */
  sectionContent: Partial<Record<string, string>>;
  /** Existing evaluation results from criteriaEvaluations table, if any. */
  existingEvaluations: Array<{
    criterionKey: string;
    status: string;
    reasoning: string;
  }>;
}): Promise<GeneratedQuestion[]> {
  const model = resolveGoogleLanguageModel(GUIDED_QUESTIONS_MODEL_ID, {
    vertexLocation: GUIDED_QUESTIONS_VERTEX_LOCATION,
  });

  const criteriaBlock = EDITABLE_SECTIONS.flatMap((section) => {
    const criteria = CRITERIA_BY_SECTION[section] ?? [];
    return criteria.map(
      (c) => `[${c.key}] (${section}) ${c.label}\n  Guidance: ${c.description}`
    );
  }).join("\n\n");

  const evalBlock =
    existingEvaluations.length > 0
      ? `\nEXISTING EVALUATIONS:\n${existingEvaluations
          .map(
            (e) =>
              `- ${e.criterionKey}: ${e.status}${e.reasoning ? ` — ${e.reasoning.slice(0, 200)}` : ""}`
          )
          .join("\n")}`
      : "";

  const contentBlock = EDITABLE_SECTIONS.map((section) => {
    const text = sectionContent[section];
    return text?.trim()
      ? `[${section.toUpperCase()}]\n${text.trim()}`
      : `[${section.toUpperCase()}]\n(empty)`;
  }).join("\n\n");

  const systemPrompt = `You are generating a tailored question set to help an engineer write a pharmaceutical deviation investigation report (DMAIC format). Your questions collect exactly the information needed to satisfy the provided evaluation criteria.

RULES:
- Generate a minimal, specific set of questions — only for information genuinely missing from the existing content.
- For empty/new reports, generate questions covering all criteria across all five sections.
- For existing content, skip criteria whose information is already clearly present. Only generate questions for gaps or criteria marked not_met / partially_met in the existing evaluations.
- Each question MUST include the exact criteriaKeys it helps satisfy (from the provided list — no invented keys).
- All Define-section questions have required: true. All other section questions have required: false.
- Questions must be specific to this deviation, not generic boilerplate. Reference equipment IDs, department, or non-conformance type from the existing content where visible.
- Use inputType "textarea" for narrative answers. Use "text" for short factual answers (IDs, dates, names). Use "choice" with options for questions with a fixed answer set (yes/no, tool choice, impact verdict: "No Impact"/"Impact"/"Not Applicable").
- For the Analyze section: generate one question per 6M category (Man/Machine/Measurement/Material/Method/Milieu), one for the 5-Why reasoning chain, one for root cause Level 1 (category), one for Level 2 (sub-category), one for Level 3 (specific description), and one per impact domain (System/Document/Product/Equipment/Patient Safety/Past Batches). Use "choice" with options ["No Impact", "Impact", "Not Applicable"] for impact verdict questions, and pair each with a follow-up textarea for justification.
- For Improve section: generate a question group for immediate actions, then one group per corrective action (up to 3 CAs). Each group covers: action description, responsible Emp. ID, target date, expected verifiable outcome. Add one question for effectiveness verification (choice: yes/no).
- For Control section: generate one group per preventive action (up to 3 PAs) covering: action description, link to root cause, responsible Emp. ID, due date, expected outcome. Add one question for interim plan (choice: yes/no) and one for effectiveness verification.
- Assign stable IDs: "define_q1", "measure_q2", "analyze_6m_man", "analyze_impact_system", "improve_immediate", "improve_ca1_action", "improve_ca1_owner", "control_pa1_action", etc.
- Cap total at 50 questions.
- Output JSON only, matching the schema exactly.`;

  const userPrompt = `DEVIATION: ${deviationNo}

EXISTING SECTION CONTENT:
"""
${contentBlock}
"""
${evalBlock}

CRITERIA TO SATISFY:
"""
${criteriaBlock}
"""

Generate the minimum set of tailored questions needed to fill information gaps. Make each question text specific to this deviation.`;

  let questions: GeneratedQuestion[] = [];

  try {
    const result = await generateText({
      model,
      output: Output.object({ schema: questionsResponseSchema }),
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0,
      maxOutputTokens: 8192,
      ...langfuseGenerateTextTelemetry({
        functionId: "guided-questions-generate",
        metadata: { feature: "guided-flow", deviationNo },
      }),
    });

    const raw =
      result.experimental_output ??
      questionsResponseSchema.parse(JSON.parse(result.text));
    questions = raw.questions;
  } catch (err) {
    console.error("[generate-guided-questions] generation failed:", err);
    throw err;
  }

  // Strip any hallucinated criterion keys
  const validated = questions.map((q) => ({
    ...q,
    criteriaKeys: q.criteriaKeys.filter((k) => ALL_CRITERION_KEYS.has(k)),
  }));

  return validated.slice(0, 50);
}
