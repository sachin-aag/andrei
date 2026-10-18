/**
 * Devanagari engineer messages are translated to English before fact
 * extraction. The fact patterns only recognize English months, Latin
 * identifiers, and unit suffixes. A failed translation stores nothing.
 */

import { generateText } from "ai";
import {
  CHAT_EXTRACT_GOOGLE_MODEL_ID,
  resolveChatExtractLanguageModel,
} from "@/lib/ai/chat/model";
import { sanitizePromptMetadata } from "@/lib/ai/chat/prompt-metadata";
import { isTestStubChat } from "@/lib/test/ai-bypass";
import { assertAiBudgetAvailable, recordAiUsage } from "@/lib/ai/usage";
import { buildGeminiThoughtSummaryProviderOptions } from "@/lib/eval/eval-generation-options";
import { langfuseGenerateTextTelemetry } from "@/lib/observability/langfuse";

const TRANSLATE_TIMEOUT_MS = 8_000;

export async function translateStatedFactToEnglish(input: {
  text: string;
  reportId: string;
  userId: string;
}): Promise<string | null> {
  if (isTestStubChat()) return null;
  const source = sanitizePromptMetadata(input.text, 4_000);
  if (!source) return null;
  try {
    const timeout = AbortSignal.timeout(TRANSLATE_TIMEOUT_MS);
    await assertAiBudgetAvailable();
    const result = await generateText({
      model: resolveChatExtractLanguageModel(),
      abortSignal: timeout,
      providerOptions: buildGeminiThoughtSummaryProviderOptions({
        thinkingLevel: "minimal",
        includeThoughts: false,
      }),
      prompt: [
        "Translate this engineer note into English.",
        "Return only the English text. Do not add facts, citations, or commentary.",
        "",
        source,
      ].join("\n"),
      ...langfuseGenerateTextTelemetry({
        functionId: "stated-fact-translate",
        metadata: {
          feature: "document_chat",
          promptVersion: "stated-fact-translate-v1",
        },
      }),
    });
    await recordAiUsage({
      feature: "document_chat",
      modelId: CHAT_EXTRACT_GOOGLE_MODEL_ID,
      usage: result.usage,
      reportId: input.reportId,
      userId: input.userId,
      metadata: { classifier: "stated-fact-translate" },
    });
    const english = unwrapTranslation(result.text);
    return english || null;
  } catch (err) {
    console.error("stated fact translation failed", err);
    return null;
  }
}

function unwrapTranslation(text: string): string {
  const trimmed = text.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}
