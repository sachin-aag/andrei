import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";
import { langfuseGenerateTextTelemetry } from "@/lib/observability/langfuse";
import type { AnsweredRecord, Methodology } from "@/lib/ai/generate-next-question";

const MODEL_ID = "gemini-3.1-flash-lite" as const;
const VERTEX_LOCATION = "global" as const;

export type MethodologySuggestion = {
  methodology: Methodology;
  reasoning: string;
};

const schema = z.object({
  methodology: z
    .enum(["5-why", "6m", "combined"])
    .describe(
      "5-why: process failure with a traceable causal chain. 6m: complex deviation involving multiple contributing factors across Man/Machine/Measurement/Material/Method/Milieu. combined: both are needed."
    ),
  reasoning: z
    .string()
    .describe(
      "2-3 sentences explaining why this methodology fits this specific deviation"
    ),
});

function summarise(records: AnsweredRecord[]): string {
  return (
    records
      .filter((r) => r.answer)
      .map((r) => `${r.label}: ${r.answer}`)
      .join("\n") || "(no answers)"
  );
}

export async function suggestInvestigationMethodology(input: {
  deviationNo: string;
  defineAnswers: AnsweredRecord[];
  measureAnswers: AnsweredRecord[];
}): Promise<MethodologySuggestion> {
  const result = await generateText({
    model: resolveGoogleLanguageModel(MODEL_ID, { vertexLocation: VERTEX_LOCATION }),
    output: Output.object({ schema }),
    system: `You are an expert in pharmaceutical GMP deviation investigation. Based on the Define and Measure information, recommend the investigation methodology for the Analyze section. Be specific to this deviation — do not give a generic recommendation.`,
    prompt: `Deviation: ${input.deviationNo}

Define section answers:
${summarise(input.defineAnswers)}

Measure section answers:
${summarise(input.measureAnswers)}

Which investigation methodology best fits this deviation, and why?`,
    temperature: 0,
    maxOutputTokens: 512,
    ...langfuseGenerateTextTelemetry({
      functionId: "guided-methodology-suggestion",
      metadata: { deviationNo: input.deviationNo },
    }),
  });

  return (
    result.experimental_output ?? {
      methodology: "combined" as Methodology,
      reasoning: "Unable to determine — using combined 5-Why + 6M as a safe default.",
    }
  );
}
