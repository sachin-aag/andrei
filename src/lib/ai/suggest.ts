import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";
import type { CriterionStatus, SectionType } from "@/db/schema";
import { contextForPrompt } from "@/lib/ai/section-context";
import type { AllSectionsContent } from "@/lib/ai/evaluate";
import {
  buildSuggestionSystemPrompt,
  buildSuggestionUserPrompt,
  SUGGEST_GOOGLE_MODEL_ID,
  SUGGEST_PROMPT_VERSION,
  SUGGEST_TEMPERATURE,
} from "@/lib/ai/suggest-prompts";
import { langfuseGenerateTextTelemetry } from "@/lib/observability/langfuse";
import { isAllowedTargetField } from "@/lib/ai/suggest-target-fields";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import { suggestionEditsPlaceholder } from "@/lib/placeholders/suggestion-placeholder-policy";
import { cleanSectionContentForEval } from "@/lib/tiptap/strip-pending-suggestions";
import { EDITABLE_SECTIONS } from "@/types/sections";

export type SuggestionDropReason =
  | "schema_invalid"
  | "bad_criterion"
  | "bad_target_field"
  | "empty_edit"
  | "placeholder_edit"
  | "not_found"
  | "ambiguous";

export type RawSuggestion = {
  criterionKey: string;
  targetField: string;
  anchorText: string;
  deleteText: string;
  insertText: string;
  reasoning: string;
};

export type GeneratedSuggestion = RawSuggestion & {
  evaluationId: string;
};

const suggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      criterionKey: z.string(),
      targetField: z.string(),
      anchorText: z.string(),
      deleteText: z.string(),
      insertText: z.string(),
      reasoning: z.string().max(300),
    })
  ),
});

/** Gemini 3.x on Vertex is served from `global` (same as criteria evaluation). */
const SUGGEST_VERTEX_LOCATION = "global" as const;

export function resolveSuggestionLanguageModel(): LanguageModel {
  return resolveGoogleLanguageModel(SUGGEST_GOOGLE_MODEL_ID, {
    vertexLocation: SUGGEST_VERTEX_LOCATION,
  });
}

function resolveModel(): LanguageModel {
  return resolveSuggestionLanguageModel();
}

function priorSections(section: SectionType): SectionType[] {
  const idx = EDITABLE_SECTIONS.indexOf(section as (typeof EDITABLE_SECTIONS)[number]);
  if (idx <= 0) return [];
  return EDITABLE_SECTIONS.slice(0, idx) as unknown as SectionType[];
}

function buildPriorSectionsBlock(
  section: SectionType,
  allSections?: AllSectionsContent
): string {
  if (!allSections) return "";
  const prior = priorSections(section);
  if (prior.length === 0) return "";

  const blocks: string[] = [];
  for (const ps of prior) {
    const raw = allSections[ps];
    if (!raw) continue;
    const cleaned = cleanSectionContentForEval(ps, raw);
    const text = contextForPrompt(ps, cleaned);
    if (!text || text.trim() === "" || text === "{}") continue;
    blocks.push(`[${ps.toUpperCase()}]\n${text}`);
  }
  if (blocks.length === 0) return "";

  return `\nPRIOR SECTIONS (read-only context — do NOT edit; anchors must come from current section only):\n"""\n${blocks.join("\n\n")}\n"""`;
}

function sectionContentForPrompt(section: SectionType, content: unknown): string {
  const cleaned = cleanSectionContentForEval(section, content);
  return contextForPrompt(section, cleaned);
}

export async function generateSuggestionsForSection({
  section,
  content,
  reportContext,
  allSections,
  gapCriteria,
}: {
  section: SectionType;
  content: unknown;
  reportContext: { deviationNo: string; date: Date | string };
  allSections?: AllSectionsContent;
  gapCriteria: Array<{
    criterionKey: string;
    criterionLabel: string;
    reasoning: string;
    evaluationId: string;
    status: CriterionStatus;
  }>;
}): Promise<{ suggestions: GeneratedSuggestion[]; dropped: Array<{ criterionKey: string; reason: SuggestionDropReason }> }> {
  if (gapCriteria.length === 0) {
    return { suggestions: [], dropped: [] };
  }

  const contentStr = sectionContentForPrompt(section, content);
  const systemPrompt = buildSuggestionSystemPrompt(section);
  const priorBlock = buildPriorSectionsBlock(section, allSections);

  const callModel = async (
    batch: typeof gapCriteria
  ): Promise<RawSuggestion[]> => {
    const userPrompt = buildSuggestionUserPrompt({
      section,
      contentStr,
      priorBlock,
      failingCriteria: batch.map((g) => ({
        key: g.criterionKey,
        label: g.criterionLabel,
        reasoning: g.reasoning,
        status: g.status,
      })),
    });

    const result = await generateText({
      model: resolveModel(),
      output: Output.object({ schema: suggestionSchema }),
      system: systemPrompt,
      prompt: `DEVIATION: ${reportContext.deviationNo} (report date: ${
        typeof reportContext.date === "string"
          ? reportContext.date
          : reportContext.date.toISOString()
      })\n\n${userPrompt}`,
      temperature: SUGGEST_TEMPERATURE,
      maxOutputTokens: 16384,
      ...langfuseGenerateTextTelemetry({
        functionId: "suggest-section-edits",
        metadata: {
          feature: "suggestion-generation",
          section,
          gapCriterionCount: batch.length,
          model: SUGGEST_GOOGLE_MODEL_ID,
          promptVersion: SUGGEST_PROMPT_VERSION,
        },
      }),
    });

    if (result.experimental_output?.suggestions) {
      return result.experimental_output.suggestions;
    }
    if (result.text) {
      const parsed = JSON.parse(result.text) as { suggestions?: RawSuggestion[] };
      return parsed.suggestions ?? [];
    }
    return [];
  };

  let rawSuggestions: RawSuggestion[] = [];
  try {
    rawSuggestions = await callModel(gapCriteria);
    const firstKeys = new Set(rawSuggestions.map((s) => s.criterionKey));
    const missing = gapCriteria.filter((g) => !firstKeys.has(g.criterionKey));
    if (missing.length > 0 && missing.length < gapCriteria.length) {
      const retryRaw = await callModel(missing);
      rawSuggestions = [...rawSuggestions, ...retryRaw];
    }
  } catch (err) {
    console.error("[suggest] LLM call failed", err);
    return {
      suggestions: [],
      dropped: gapCriteria.map((g) => ({
        criterionKey: g.criterionKey,
        reason: "schema_invalid" as const,
      })),
    };
  }

  const allowedKeys = new Set(gapCriteria.map((g) => g.criterionKey));
  const evalIdByKey = new Map(gapCriteria.map((g) => [g.criterionKey, g.evaluationId]));

  const suggestions: GeneratedSuggestion[] = [];
  const dropped: Array<{ criterionKey: string; reason: SuggestionDropReason }> = [];
  const seenKeys = new Set<string>();

  for (const s of rawSuggestions) {
    if (!allowedKeys.has(s.criterionKey)) {
      dropped.push({ criterionKey: s.criterionKey, reason: "bad_criterion" });
      continue;
    }
    if (seenKeys.has(s.criterionKey)) continue;
    seenKeys.add(s.criterionKey);

    if (!isAllowedTargetField(section, s.targetField)) {
      dropped.push({ criterionKey: s.criterionKey, reason: "bad_target_field" });
      continue;
    }
    if (!s.deleteText.trim() && !s.insertText.trim()) {
      dropped.push({ criterionKey: s.criterionKey, reason: "empty_edit" });
      continue;
    }
    if (suggestionEditsPlaceholder(s)) {
      dropped.push({ criterionKey: s.criterionKey, reason: "placeholder_edit" });
      continue;
    }

    const evaluationId = evalIdByKey.get(s.criterionKey);
    if (!evaluationId) {
      dropped.push({ criterionKey: s.criterionKey, reason: "bad_criterion" });
      continue;
    }

    suggestions.push({
      ...s,
      insertText: normalizeSuggestionInsertText(s.insertText),
      evaluationId,
    });
  }

  for (const g of gapCriteria) {
    if (!seenKeys.has(g.criterionKey)) {
      dropped.push({ criterionKey: g.criterionKey, reason: "schema_invalid" });
    }
  }

  return { suggestions, dropped };
}
