import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";
import { langfuseGenerateTextTelemetry } from "@/lib/observability/langfuse";
import { CRITERIA_BY_SECTION } from "@/lib/ai/criteria";
import { EDITABLE_SECTIONS } from "@/types/sections";

const MODEL_ID = "gemini-3.1-flash-lite" as const;
const VERTEX_LOCATION = "global" as const;

export type EditableSection = (typeof EDITABLE_SECTIONS)[number];
export type Methodology = "5-why" | "6m" | "combined";

/** A question that has already been answered (or deferred). */
export type AnsweredRecord = {
  section: EditableSection;
  criteriaKeys: string[];
  label: string;
  answer: string | null; // null = deferred
};

/** A question the wizard should present to the user. */
export type NextQuestion = {
  id: string;
  section: EditableSection;
  criteriaKeys: string[];
  label: string;
  description?: string;
  inputType: "text" | "textarea" | "choice";
  options?: string[];
  required: boolean;
};

const responseSchema = z.object({
  done: z
    .boolean()
    .describe(
      "true if all important criteria for this section are covered by existing content + previous answers; false if there is at least one more question to ask"
    ),
  question: z
    .object({
      id: z.string().describe("stable unique id e.g. 'define_q1', 'measure_q2'"),
      criteriaKeys: z
        .array(z.string())
        .describe("criterion keys from the provided list that this question addresses"),
      label: z
        .string()
        .describe(
          "the question text — specific to this deviation, not generic boilerplate"
        ),
      description: z
        .string()
        .optional()
        .describe("optional helper text shown below the label"),
      inputType: z
        .enum(["text", "textarea", "choice"])
        .describe(
          "textarea for narrative/multi-sentence answers; text for short factual answers; choice for known-option sets"
        ),
      options: z
        .array(z.string())
        .optional()
        .describe("only for choice inputType"),
      required: z
        .boolean()
        .describe(
          "true for Define questions and any other question critical to meeting criteria; false for supplementary depth questions"
        ),
    })
    .nullable()
    .describe("null when done is true"),
});

export async function generateNextQuestion(input: {
  deviationNo: string;
  currentSection: EditableSection;
  existingContent: string;
  answeredSoFar: AnsweredRecord[];
  methodology?: Methodology;
}): Promise<{ done: boolean; question: NextQuestion | null }> {
  const criteria = CRITERIA_BY_SECTION[input.currentSection] ?? [];
  const allCriterionKeys = new Set(criteria.map((c) => c.key));

  const criteriaList = criteria
    .map((c) => `- ${c.key}: ${c.label}${c.description ? ` — ${c.description}` : ""}`)
    .join("\n");

  // Only consider answers for the current section when assessing coverage
  const sectionAnswers = input.answeredSoFar.filter((q) =>
    q.criteriaKeys.some((k) => allCriterionKeys.has(k))
  );

  const answeredContext =
    sectionAnswers.length > 0
      ? sectionAnswers
          .map(
            (q) =>
              `Q: ${q.label}\nA: ${q.answer ?? "[deferred — placeholder will be inserted]"}`
          )
          .join("\n\n")
      : "(none yet)";

  const coveredKeys = new Set(
    sectionAnswers
      .filter((q) => q.answer !== null && q.answer !== "")
      .flatMap((q) => q.criteriaKeys)
      .filter((k) => allCriterionKeys.has(k))
  );

  const uncovered = criteria
    .filter((c) => !coveredKeys.has(c.key))
    .map((c) => `- ${c.key}: ${c.label}`)
    .join("\n");

  const methodologyNote =
    input.currentSection === "analyze" && input.methodology
      ? input.methodology === "5-why"
        ? "\nMETHODOLOGY: 5-Why — ask questions that build the causal chain (Why 1 → Why 5). Do not ask about 6M categories unless they are directly relevant to the causal chain."
        : input.methodology === "6m"
          ? "\nMETHODOLOGY: 6M Analysis — ask about each relevant M category (Man, Machine, Measurement, Material, Method, Milieu). Do not emphasise the 5-Why chain."
          : "\nMETHODOLOGY: Combined 5-Why + 6M — ask both 6M category questions and Why-chain questions."
      : "";

  const systemPrompt = `You are Andrei, an AI assistant for pharmaceutical deviation investigation reports. You ask ONE question at a time to gather information for the ${input.currentSection.toUpperCase()} section of a DMAIC report.

RULES:
- Generate exactly ONE question — the highest-priority uncovered criterion
- The question must be specific to this deviation (use details from previous answers: equipment names, locations, dates, product codes)
- Never ask for information already in existing content or previous answers
- Return done=true if all important criteria are sufficiently addressed
- For the Define section, mark required=true on every question
- For other sections, required=false unless critical to criteria
- textarea: narrative descriptions, multi-sentence analysis
- text: short factual answers (dates, IDs, names, room codes)
- choice: fixed-option sets (yes/no, methodology choice, impact verdict)${methodologyNote}`;

  const userPrompt = `Deviation: ${input.deviationNo}
Section: ${input.currentSection.toUpperCase()}

Criteria to meet:
${criteriaList}

Existing section content (from report):
${input.existingContent.trim() || "(empty)"}

Questions already asked for this section:
${answeredContext}

Uncovered criteria:
${uncovered || "(all covered)"}

Generate the next question, or return done=true if the section is sufficiently covered.`;

  const result = await generateText({
    model: resolveGoogleLanguageModel(MODEL_ID, { vertexLocation: VERTEX_LOCATION }),
    output: Output.object({ schema: responseSchema }),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0,
    maxOutputTokens: 1024,
    ...langfuseGenerateTextTelemetry({
      functionId: "guided-next-question",
      metadata: { section: input.currentSection, deviationNo: input.deviationNo },
    }),
  });

  const output = result.experimental_output;
  if (!output || output.done || !output.question) {
    return { done: true, question: null };
  }

  const validatedCriteriaKeys = output.question.criteriaKeys.filter((k) =>
    allCriterionKeys.has(k)
  );

  return {
    done: false,
    question: {
      ...output.question,
      section: input.currentSection,
      criteriaKeys: validatedCriteriaKeys,
    },
  };
}
