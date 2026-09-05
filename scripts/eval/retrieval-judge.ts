import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";
import type { RetrievalEvalCase } from "@/lib/attachments/retrieval-metrics";

export const RETRIEVAL_JUDGE_PROMPT_VERSION = "retrieval-judge-v1";
export const RETRIEVAL_JUDGE_MODEL_ID = "gemini-3.5-flash-lite";

const judgeSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  reasoning: z.string().min(1),
});

export type RetrievalJudgeHit = {
  filename: string;
  pageNumber: number;
  text: string;
};

export type RetrievalJudgeVerdict = {
  verdict: "pass" | "fail";
  reasoning: string;
};

export function buildRetrievalJudgePrompt(input: {
  query: string;
  passCriteria: string;
  hits: readonly RetrievalJudgeHit[];
}): { system: string; user: string } {
  const hits =
    input.hits.length === 0
      ? "(no search hits)"
      : input.hits
          .map(
            (hit, index) =>
              `${index + 1}. [${hit.filename}, p. ${hit.pageNumber}]\n${hit.text}`
          )
          .join("\n\n");
  return {
    system: [
      "You grade attachment search excerpts for a quality-document assistant.",
      "Decide pass or fail against the pass criteria only.",
      "Fail when the right page was found but the excerpt is the wrong slice (headers/boilerplate without the answering row).",
      "Fail when excerpts claim an identifier or instrument that is not actually present in those excerpts.",
      "Empty hits fail unless the criteria say the fact is not in the corpus.",
      "Do not reward filename/page identity alone.",
    ].join(" "),
    user: [
      `QUERY: ${input.query}`,
      `PASS CRITERIA: ${input.passCriteria}`,
      "RETRIEVED EXCERPTS:",
      hits,
    ].join("\n\n"),
  };
}

export async function judgeRetrievalCase(
  entry: Pick<RetrievalEvalCase, "query" | "passCriteria">,
  hits: readonly RetrievalJudgeHit[]
): Promise<RetrievalJudgeVerdict> {
  const prompt = buildRetrievalJudgePrompt({
    query: entry.query,
    passCriteria: entry.passCriteria,
    hits,
  });
  const { output } = await generateText({
    model: resolveGoogleLanguageModel(RETRIEVAL_JUDGE_MODEL_ID, {
      vertexLocation: "global",
    }),
    output: Output.object({ schema: judgeSchema }),
    system: prompt.system,
    prompt: prompt.user,
    temperature: 0,
  });
  if (!output) {
    throw new Error("Retrieval judge returned no structured output");
  }
  return output;
}
