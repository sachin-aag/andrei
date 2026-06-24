import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";
import { langfuseGenerateTextTelemetry } from "@/lib/observability/langfuse";
import { linesToDoc } from "@/lib/tiptap/rich-text";
import type { SectionContentMap } from "@/types/sections";
import type { GeneratedQuestion } from "@/lib/ai/generate-guided-questions";
import { EDITABLE_SECTIONS } from "@/types/sections";

const DRAFT_MODEL_ID = "gemini-3.1-pro-preview" as const;
const DRAFT_VERTEX_LOCATION = "global" as const;
const DRAFT_TEMPERATURE = 0.3 as const;

type EditableSection = (typeof EDITABLE_SECTIONS)[number];
type Answers = Record<string, string | null>;

function resolveModel() {
  return resolveGoogleLanguageModel(DRAFT_MODEL_ID, {
    vertexLocation: DRAFT_VERTEX_LOCATION,
  });
}

/** Build the Q&A block for a section, marking deferred answers as placeholders. */
function buildQaBlock(
  section: EditableSection,
  questions: GeneratedQuestion[],
  answers: Answers
): string {
  const sectionQs = questions.filter((q) => q.section === section);
  if (sectionQs.length === 0) return "(no questions provided for this section)";

  return sectionQs
    .map((q) => {
      const answer = answers[q.id];
      if (answer === null || answer === undefined) {
        return `Q: ${q.label}\nA: [NOT PROVIDED — insert placeholder: [${q.label}: <to be filled>]]`;
      }
      return `Q: ${q.label}\nA: ${answer.trim() || "[left blank]"}`;
    })
    .join("\n\n");
}

/** Build a prior sections context block (same pattern as evaluateSection). */
function buildPriorSectionsBlock(
  section: EditableSection,
  generated: Partial<Record<EditableSection, string>>
): string {
  const idx = EDITABLE_SECTIONS.indexOf(section);
  if (idx <= 0) return "";

  const blocks = EDITABLE_SECTIONS.slice(0, idx)
    .map((ps) => {
      const text = generated[ps];
      return text ? `[${ps.toUpperCase()}]\n${text}` : null;
    })
    .filter(Boolean);

  if (blocks.length === 0) return "";
  return `\nPRIOR SECTIONS (context only — do not rewrite these):\n"""\n${blocks.join("\n\n")}\n"""`;
}

// --- Section-specific output schemas ---

const defineOutputSchema = z.object({
  narrative: z.string(),
});

const measureOutputSchema = z.object({
  narrative: z.string(),
  regulatoryNotification: z.string().optional(),
});

const analyzeOutputSchema = z.object({
  sixM: z.object({
    man: z.string(),
    machine: z.string(),
    measurement: z.string(),
    material: z.string(),
    method: z.string(),
    milieu: z.string(),
    conclusion: z.string(),
  }),
  fiveWhy: z.string(),
  investigationOutcome: z.string(),
  rootCause: z.string(),
  impactAssessment: z.string(),
});

const improveOutputSchema = z.object({
  narrative: z.string(),
  correctiveActions: z.string(),
});

const controlOutputSchema = z.object({
  preventiveActions: z.string(),
});

const SECTION_SYSTEM_PROMPT = `You are Andrei, an AI assistant writing pharmaceutical deviation investigation reports per SOP/DP/QA/008 (DMAIC format). Write professional, factual, GMP-compliant narrative in third person past tense.

RULES:
- Use only the information provided in the Q&A answers.
- For any answer that says "insert placeholder: [Label: <to be filled>]", include exactly that bracketed text verbatim in your output — do NOT invent a value.
- Do not repeat questions. Write flowing, coherent prose.
- Reference personnel by Emp. ID only (not by name).
- Include specific identifiers: equipment IDs, batch numbers, SOP numbers, room codes — exactly as provided.
- Write in formal pharmaceutical documentation style.
- Output JSON only, matching the provided schema exactly.`;

async function generateSection<T>(
  section: EditableSection,
  schema: z.ZodType<T>,
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  const result = await generateText({
    model: resolveModel(),
    output: Output.object({ schema }),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: DRAFT_TEMPERATURE,
    maxOutputTokens: 8192,
    ...langfuseGenerateTextTelemetry({
      functionId: `guided-draft-${section}`,
      metadata: { feature: "guided-flow", section },
    }),
  });

  if (result.experimental_output) return result.experimental_output as T;
  return schema.parse(JSON.parse(result.text));
}

export async function generateGuidedDraft({
  reportContext,
  questions,
  answers,
}: {
  reportContext: { deviationNo: string; date: Date | string };
  questions: GeneratedQuestion[];
  answers: Answers;
}): Promise<Partial<SectionContentMap>> {
  const dateStr =
    typeof reportContext.date === "string"
      ? reportContext.date
      : reportContext.date.toISOString().split("T")[0];

  const generatedText: Partial<Record<EditableSection, string>> = {};
  const result: Partial<SectionContentMap> = {};

  // --- Define ---
  const defineQa = buildQaBlock("define", questions, answers);
  const defineResult = await generateSection(
    "define",
    defineOutputSchema,
    SECTION_SYSTEM_PROMPT,
    `DEVIATION: ${reportContext.deviationNo} (date: ${dateStr})

SECTION: DEFINE
The Define section must: describe exactly what happened and on what equipment, state the expected standard and how it was not met (with SOP reference), specify the physical location with room code, state both date/time of occurrence and date/time of detection, identify all involved personnel by Emp. ID, and define the initial scope of impact.

Q&A ANSWERS:
${defineQa}

Write the Define section narrative.`
  );
  generatedText.define = defineResult.narrative;
  result.define = { narrative: linesToDoc(defineResult.narrative) };

  // --- Measure ---
  const measureQa = buildQaBlock("measure", questions, answers);
  const hasMeasureQs = questions.some((q) => q.section === "measure");
  if (hasMeasureQs) {
    const priorBlock = buildPriorSectionsBlock("measure", generatedText);
    const measureResult = await generateSection(
      "measure",
      measureOutputSchema,
      SECTION_SYSTEM_PROMPT,
      `DEVIATION: ${reportContext.deviationNo} (date: ${dateStr})

SECTION: MEASURE
The Measure section must: summarise all relevant facts and data reviewed (environment, process/product history, calibration status, personnel records, control limits), provide an analysis of contributing factors, state a clear conclusion from the data review, and address regulatory notification (explicitly state whether required or not applicable).

Q&A ANSWERS:
${measureQa}
${priorBlock}

Write the Measure section. For "regulatoryNotification", write a single sentence (e.g. "No regulatory notification required." or "Regulatory notification to [authority] required by [date].") or leave empty if not addressed.`
    );
    generatedText.measure = measureResult.narrative;
    result.measure = {
      narrative: linesToDoc(measureResult.narrative),
      regulatoryNotification: measureResult.regulatoryNotification ?? "",
    };
  }

  // --- Analyze ---
  const analyzeQa = buildQaBlock("analyze", questions, answers);
  const hasAnalyzeQs = questions.some((q) => q.section === "analyze");
  if (hasAnalyzeQs) {
    const priorBlock = buildPriorSectionsBlock("analyze", generatedText);
    const analyzeResult = await generateSection(
      "analyze",
      analyzeOutputSchema,
      SECTION_SYSTEM_PROMPT,
      `DEVIATION: ${reportContext.deviationNo} (date: ${dateStr})

SECTION: ANALYZE
The Analyze section must: complete all 6M fields (Man/Machine/Measurement/Material/Method/Milieu) with findings or "Not Applicable" with rationale, document the 5-Why causal chain with fact-based questions and answers, summarise the investigation outcome, classify the root cause at Level 1/Level 2/Level 3, and assess impact across all five domains (System/Document/Product/Equipment/Patient Safety).

Q&A ANSWERS:
${analyzeQa}
${priorBlock}

For each 6M field write 1-3 sentences. For "fiveWhy" write the full Why→Answer chain as flowing text. For "investigationOutcome" write a 2-3 sentence summary. For "rootCause" write the three-level classification in the format: "Level 1: [category] | Level 2: [sub-category] | Level 3: [specific cause]". For "impactAssessment" write a structured paragraph covering all five impact domains.`
    );

    if (generatedText.measure) {
      generatedText.analyze = analyzeResult.investigationOutcome;
    }
    result.analyze = {
      sixM: analyzeResult.sixM,
      fiveWhy: { narrative: linesToDoc(analyzeResult.fiveWhy), conclusion: "" },
      brainstorming: "",
      otherTools: "",
      investigationOutcome: linesToDoc(analyzeResult.investigationOutcome),
      rootCause: { narrative: linesToDoc(analyzeResult.rootCause) },
      impactAssessment: linesToDoc(analyzeResult.impactAssessment),
    };
  }

  // --- Improve ---
  const improveQa = buildQaBlock("improve", questions, answers);
  const hasImproveQs = questions.some((q) => q.section === "improve");
  if (hasImproveQs) {
    const priorBlock = buildPriorSectionsBlock("improve", generatedText);
    const improveResult = await generateSection(
      "improve",
      improveOutputSchema,
      SECTION_SYSTEM_PROMPT,
      `DEVIATION: ${reportContext.deviationNo} (date: ${dateStr})

SECTION: IMPROVE
The Improve section must: document immediate actions taken to restore control, list specific corrective actions for each root cause with a unique tracking number, responsible person (Emp. ID), target date, and expected verifiable outcome, and state whether effectiveness verification is required with rationale.

Q&A ANSWERS:
${improveQa}
${priorBlock}

Write "narrative" as a prose paragraph summarising the immediate actions. Write "correctiveActions" as a structured list (one CA per line, numbered, with: action, CA-N number, responsible Emp. ID, target date, expected outcome, effectiveness verification statement).`
    );
    result.improve = {
      narrative: linesToDoc(improveResult.narrative),
      correctiveActions: linesToDoc(improveResult.correctiveActions),
    };
  }

  // --- Control ---
  const controlQa = buildQaBlock("control", questions, answers);
  const hasControlQs = questions.some((q) => q.section === "control");
  if (hasControlQs) {
    const priorBlock = buildPriorSectionsBlock("control", generatedText);
    const controlResult = await generateSection(
      "control",
      controlOutputSchema,
      SECTION_SYSTEM_PROMPT,
      `DEVIATION: ${reportContext.deviationNo} (date: ${dateStr})

SECTION: CONTROL
The Control section must: document specific preventive actions for each root cause linked to the root cause classification, assign unique PA tracking numbers with responsible Emp. ID and due date and expected verifiable outcome, address whether an interim plan is required, specify effectiveness verification requirements, assess regulatory/product quality/validation/stability/market-clinical impacts, recommend lot disposition, and provide a final conclusion with rationale.

Q&A ANSWERS:
${controlQa}
${priorBlock}

Write "preventiveActions" as a structured document covering: (1) numbered preventive actions with PA-N number/owner/due date/outcome/effectiveness verification, (2) interim plan decision with rationale, (3) final impact assessment fields (Regulatory/Product Quality/Validation/Stability/Market-Clinical), (4) recommended lot disposition, (5) final conclusion paragraph.`
    );
    result.control = {
      preventiveActions: linesToDoc(controlResult.preventiveActions),
    };
  }

  return result;
}
