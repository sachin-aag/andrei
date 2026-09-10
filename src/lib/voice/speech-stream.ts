import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";
import { assertAiBudgetAvailable, recordAiUsage } from "@/lib/ai/usage";
import { buildGeminiThoughtSummaryProviderOptions } from "@/lib/eval/eval-generation-options";
import { langfuseGenerateTextTelemetry } from "@/lib/observability/langfuse";
import { isTestStubSpeech } from "@/lib/test/ai-bypass";
import {
  assertVoiceBudgetAvailable,
  recordVoiceUsage,
} from "@/lib/voice/budget";
import {
  STUB_VOICE_FINAL,
  VOICE_MIN_WINDOW_BYTES,
  VOICE_RECOGNIZE_TIMEOUT_MS,
  VOICE_TRANSCRIBE_GOOGLE_MODEL_ID,
} from "@/lib/voice/constants";
import { pcmAudioSeconds } from "@/lib/voice/pcm-duration";
import { pcmS16leMonoToWav } from "@/lib/voice/pcm-wav";

export type VoiceRecognizeResult = {
  text: string;
  languageCode?: string;
};

export const VOICE_TRANSCRIBE_SYSTEM = `Transcribe speech into the words that were said.
Keep Hindi and Marathi in their original script (Devanagari). Do not translate into English.
If the clip is silence or unintelligible, return an empty text string.`;

const transcriptSchema = z.object({
  text: z.string(),
});

function transcribeModel() {
  return resolveGoogleLanguageModel(VOICE_TRANSCRIBE_GOOGLE_MODEL_ID, {
    vertexLocation: "global",
  });
}

/**
 * One Gemini unary transcribe of a LINEAR16 window. Do not call Cloud
 * Speech-to-Text — the Vercel WIF SA can use Vertex Gemini (same as chat)
 * but Chirp 403s as PERMISSION_DENIED without roles/speech.client.
 */
export async function recognizePcmWindow(opts: {
  pcm: Uint8Array;
  languageCodes: readonly string[];
  reportId?: string | null;
  userId?: string | null;
}): Promise<VoiceRecognizeResult> {
  if (isTestStubSpeech()) {
    return { text: STUB_VOICE_FINAL, languageCode: "en-US" };
  }
  if (opts.pcm.byteLength < VOICE_MIN_WINDOW_BYTES) {
    return { text: "" };
  }

  const audioSeconds = pcmAudioSeconds(opts.pcm);
  await assertVoiceBudgetAvailable({ audioSeconds });
  await assertAiBudgetAvailable();
  const wav = pcmS16leMonoToWav(opts.pcm);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VOICE_RECOGNIZE_TIMEOUT_MS);
  try {
    const result = await generateText({
      model: transcribeModel(),
      output: Output.object({ schema: transcriptSchema }),
      providerOptions: buildGeminiThoughtSummaryProviderOptions({
        thinkingLevel: "minimal",
        includeThoughts: false,
      }),
      system: VOICE_TRANSCRIBE_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Possible languages: ${opts.languageCodes.join(", ")}. Transcribe this clip.`,
            },
            {
              type: "file",
              data: wav,
              mediaType: "audio/wav",
              filename: "dictation.wav",
            },
          ],
        },
      ],
      abortSignal: controller.signal,
      ...langfuseGenerateTextTelemetry({
        functionId: "voice-transcribe",
        metadata: { feature: "voice_transcribe" },
      }),
    });
    await recordVoiceUsage({
      audioSeconds,
      reportId: opts.reportId,
      userId: opts.userId,
      metadata: { languageCodes: opts.languageCodes },
    });
    await recordAiUsage({
      feature: "voice_transcribe",
      modelId: VOICE_TRANSCRIBE_GOOGLE_MODEL_ID,
      usage: result.usage,
      reportId: opts.reportId,
      userId: opts.userId,
      metadata: { audioSeconds, languageCodes: opts.languageCodes },
    });
    return { text: result.output?.text?.trim() ?? "" };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Voice input timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
