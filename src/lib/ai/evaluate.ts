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

const suggestedFixSchema = z.object({
  anchorText: z.string().max(800),
  replacementText: z.string().max(2000),
});

const evaluationSchema = z.object({
  evaluations: z.array(
    z.object({
      criterionKey: z.string(),
      status: z.enum(["met", "partially_met", "not_met"]),
      reasoning: z.string().min(1).max(1200),
      suggestedFix: suggestedFixSchema,
    })
  ),
});

export type SuggestedFix = {
  anchorText: string;
  replacementText: string;
};

export const EMPTY_SUGGESTED_FIX: SuggestedFix = {
  anchorText: "",
  replacementText: "",
};

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
      suggestedFix: { ...EMPTY_SUGGESTED_FIX },
    }));
  }

  const systemPrompt = `You are a pharmaceutical quality assurance reviewer at M.J. Biopharm Private Limited. You evaluate deviation investigation reports written per SOP/DP/QA/008 using a traffic light system:
- "met": the criterion is clearly and completely addressed.
- "partially_met": the criterion is addressed but with gaps, ambiguity, or missing specifics.
- "not_met": the criterion is missing, unclear, or incorrect.

Always provide a brief "reasoning" (1-3 sentences) explaining your judgment.

CRITICAL SCOPE RULE:
- Determine "status" and "reasoning" using ONLY the current SECTION CONTENT.
- Previous sections (if provided) are context-only and MUST NOT be used to
  mark a criterion as met/partially_met/not_met for the current section.
- Previous sections may be used only to keep suggestedFix wording consistent
  (terminology, chronology, and cross-section coherence).

For "met", set suggestedFix to {"anchorText": "", "replacementText": ""}.

For "partially_met" or "not_met", produce a structured suggestedFix that the user can apply directly to the section without further editing. Your replacementText will appear inline immediately as a pending edit (track-changes style) right where the anchor was, so it must read naturally in that exact spot.

- "replacementText" MUST be the LITERAL prose to insert into the report, written in the voice of a GMP investigation report — factual, precise, complete sentences. It is what will appear in the document verbatim where the anchor used to sit.
  * Do NOT use suggestion or instruction language: never write "should", "must", "needs to", "consider adding", "the narrative should", "add a statement that", "include details about", "mention the…", "it would be better to", or similar.
  * Do NOT include labels like "Suggested fix:", "Revised text:", quotes around the whole reply, or commentary. Do NOT mention the criterion you are addressing.
  * Write it self-contained: it must read sensibly when slotted in place of the anchor (or at the end of the section if the anchor is empty), without any surrounding edits.
  * If you don't have the real-world fact (e.g. you don't know the actual Emp. ID, room number, or SOP revision), use a clearly bracketed placeholder containing the literal token "<to be filled>" — for example "[Emp. ID: <to be filled>]", "[SOP No.: <to be filled>]", "[Room ID: <to be filled>]". The exact "<to be filled>" token is required so the editor can highlight these as actionable todos for the author. Still write it as a complete sentence in report voice.

- "anchorText" MUST be a SHORT verbatim substring (one or two sentences max) copied EXACTLY from the SECTION CONTENT above — same characters, same punctuation, same casing — that the replacementText should overwrite. Choose the vague or incorrect sentence that needs to be rewritten. Do NOT paraphrase or rewrite the anchor; if you cannot find a suitable substring to copy, leave anchorText as "".
  * If anchorText is "" the replacementText will be appended as a new paragraph at the end of the section. Choose this only when there is no existing sentence to rewrite — otherwise prefer in-place replacement.
  * If anchorText is non-empty, it will be replaced by replacementText in place.

Examples (for the "Personnel involved" criterion):
  GOOD replacementText: "The deviation was observed by the analyst (Emp. ID: [to be filled]) during routine HPLC analysis."
  BAD  replacementText: "The narrative should mention the Emp. ID of the analyst who observed the deviation."
  GOOD anchorText (copied verbatim from the section): "The deviation was observed by the analyst during routine HPLC analysis."
  BAD  anchorText (paraphrased): "Mention of the analyst observing the deviation."`;

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
        suggestedFix: { ...EMPTY_SUGGESTED_FIX },
      };
    }
    return {
      criterionKey: c.key,
      criterionLabel: c.label,
      status: result.status as CriterionStatus,
      reasoning: result.reasoning,
      suggestedFix: result.suggestedFix ?? { ...EMPTY_SUGGESTED_FIX },
    };
  });
}
