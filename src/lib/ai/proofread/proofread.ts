import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import type { DocumentType } from "@/db/schema";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";
import { recordAiUsage } from "@/lib/ai/usage";
import { langfuseGenerateTextTelemetry } from "@/lib/observability/langfuse";
import { isTestStubProofread } from "@/lib/test/ai-bypass";
import { hashProofreadText } from "@/lib/proofread/hash";
import { gateProofreadEdit } from "@/lib/ai/proofread/gate";
import {
  PROOFREAD_GOOGLE_MODEL_ID,
  PROOFREAD_MAX_ISSUES_PER_UNIT,
  PROOFREAD_PROMPT_VERSION,
  PROOFREAD_VERTEX_LOCATION,
  buildProofreadSystemPrompt,
  buildProofreadUserPrompt,
} from "@/lib/ai/proofread/prompts";
import { stubProofreadIssues } from "@/lib/ai/proofread/stub";
import type { ProofreadIssue, ProofreadUnit } from "@/lib/ai/proofread/types";

const proofreadSchema = z.object({
  issues: z.array(
    z.object({
      unitId: z.string(),
      severity: z.enum(["grammar", "tone"]),
      deleteText: z.string().min(1).max(200),
      insertText: z.string().max(240),
      label: z.string().max(80),
    })
  ),
});

export function resolveProofreadLanguageModel(): LanguageModel {
  return resolveGoogleLanguageModel(PROOFREAD_GOOGLE_MODEL_ID, {
    vertexLocation: PROOFREAD_VERTEX_LOCATION,
  });
}

function issuesForUnits(
  units: ProofreadUnit[],
  raw: z.infer<typeof proofreadSchema>["issues"]
): ProofreadIssue[] {
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const countByUnit = new Map<string, number>();
  const issues: ProofreadIssue[] = [];

  for (const row of raw) {
    const unit = unitById.get(row.unitId);
    if (!unit) continue;
    const used = countByUnit.get(unit.id) ?? 0;
    if (used >= PROOFREAD_MAX_ISSUES_PER_UNIT) continue;

    const gated = gateProofreadEdit(unit.text, {
      deleteText: row.deleteText,
      insertText: row.insertText,
      anchorText: "",
    });
    if (!gated.ok) continue;

    const unitHash = hashProofreadText(unit.text);
    issues.push({
      id: `${unitHash}:${gated.edit.deleteText}:${gated.edit.insertText}`,
      unitId: unit.id,
      unitHash,
      severity: row.severity,
      deleteText: gated.edit.deleteText,
      insertText: gated.edit.insertText,
      anchorText: gated.edit.anchorText,
      label: row.label.trim() || gated.edit.insertText || "Fix",
    });
    countByUnit.set(unit.id, used + 1);
  }

  return issues;
}

export async function proofreadUnits(input: {
  units: ProofreadUnit[];
  documentType: DocumentType;
  reportId?: string;
  userId?: string;
  model?: LanguageModel;
  signal?: AbortSignal;
}): Promise<ProofreadIssue[]> {
  if (input.units.length === 0) return [];

  if (isTestStubProofread()) {
    return stubProofreadIssues(input.units);
  }

  const resolvedModel = input.model ?? resolveProofreadLanguageModel();
  const result = await generateText({
    model: resolvedModel,
    output: Output.object({ schema: proofreadSchema }),
    system: buildProofreadSystemPrompt(input.documentType),
    prompt: buildProofreadUserPrompt(input.units),
    maxOutputTokens: 1024,
    abortSignal: input.signal,
    ...langfuseGenerateTextTelemetry({
      functionId: "inline-proofread",
      metadata: {
        feature: "inline-proofread",
        model: PROOFREAD_GOOGLE_MODEL_ID,
        promptVersion: PROOFREAD_PROMPT_VERSION,
        unitCount: input.units.length,
      },
    }),
  });

  await recordAiUsage({
    feature: "inline_proofread",
    modelId: PROOFREAD_GOOGLE_MODEL_ID,
    usage: result.usage,
    reportId: input.reportId,
    userId: input.userId,
    metadata: {
      promptVersion: PROOFREAD_PROMPT_VERSION,
      unitCount: input.units.length,
    },
  });

  const raw = result.experimental_output?.issues ?? [];
  return issuesForUnits(input.units, raw);
}

export { issuesForUnits as mapProofreadModelIssuesForTests };
