import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModel } from "ai";

const generateTextMock = vi.fn();

vi.mock("@/lib/test/ai-bypass", () => ({
  isTestStubSpeech: vi.fn(() => true),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: (...args: unknown[]) => generateTextMock(...args),
  };
});

vi.mock("@/lib/ai/resolve-google-language-model", () => ({
  resolveGoogleLanguageModel: vi.fn(() => ({ modelId: "stub" }) as LanguageModel),
}));

vi.mock("@/lib/ai/usage", () => ({
  assertAiBudgetAvailable: vi.fn().mockResolvedValue(undefined),
  recordAiUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/voice/budget", () => ({
  assertVoiceBudgetAvailable: vi.fn().mockResolvedValue(undefined),
  recordVoiceUsage: vi.fn().mockResolvedValue(undefined),
}));

import { isTestStubSpeech } from "@/lib/test/ai-bypass";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";
import { recordAiUsage } from "@/lib/ai/usage";
import { VOICE_INPUT_MJ_CODES } from "@/lib/customers/packs";
import { recordVoiceUsage } from "@/lib/voice/budget";
import {
  STUB_VOICE_FINAL,
  VOICE_TRANSCRIBE_GOOGLE_MODEL_ID,
} from "./constants";
import { pcmS16leMonoToWav } from "./pcm-wav";
import {
  recognizePcmWindow,
  VOICE_TRANSCRIBE_SYSTEM,
} from "./speech-stream";

describe("recognizePcmWindow", () => {
  beforeEach(() => {
    vi.mocked(isTestStubSpeech).mockReturnValue(true);
    generateTextMock.mockReset();
    vi.mocked(resolveGoogleLanguageModel).mockClear();
    vi.mocked(recordVoiceUsage).mockClear();
    vi.mocked(recordAiUsage).mockClear();
  });

  it("returns the canned stub transcript without calling Gemini", async () => {
    await expect(
      recognizePcmWindow({
        pcm: new Uint8Array(4),
        languageCodes: ["en-US"],
      })
    ).resolves.toEqual({ text: STUB_VOICE_FINAL, languageCode: "en-US" });
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(recordVoiceUsage).not.toHaveBeenCalled();
  });

  it("skips STT for a short window when not stubbed", async () => {
    vi.mocked(isTestStubSpeech).mockReturnValue(false);
    await expect(
      recognizePcmWindow({
        pcm: new Uint8Array(10),
        languageCodes: ["en-US"],
      })
    ).resolves.toEqual({ text: "" });
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(recordVoiceUsage).not.toHaveBeenCalled();
  });

  it("sends a WAV clip to Vertex Gemini and keeps Devanagari", async () => {
    vi.mocked(isTestStubSpeech).mockReturnValue(false);
    generateTextMock.mockResolvedValue({
      output: { text: "नमस्कार" },
      text: "",
      usage: { inputTokens: 4, outputTokens: 2 },
    });

    const pcm = new Uint8Array(8_000);
    await expect(
      recognizePcmWindow({ pcm, languageCodes: VOICE_INPUT_MJ_CODES })
    ).resolves.toEqual({ text: "नमस्कार" });

    expect(resolveGoogleLanguageModel).toHaveBeenCalledWith(
      VOICE_TRANSCRIBE_GOOGLE_MODEL_ID,
      { vertexLocation: "global" }
    );
    expect(generateTextMock).toHaveBeenCalledOnce();
    const call = generateTextMock.mock.calls[0]?.[0] as {
      system: string;
      messages: Array<{
        content: Array<{
          type: string;
          text?: string;
          mediaType?: string;
          data?: Uint8Array;
        }>;
      }>;
    };
    expect(call.system).toBe(VOICE_TRANSCRIBE_SYSTEM);
    expect(call.system).toContain("Do not translate into English");
    expect(JSON.stringify(call)).not.toContain("translationConfig");
    const filePart = call.messages[0]?.content.find((part) => part.type === "file");
    expect(filePart?.mediaType).toBe("audio/wav");
    expect(filePart?.data).toEqual(pcmS16leMonoToWav(pcm));
    expect(call.messages[0]?.content[0]?.text).toContain("hi-IN");
    expect(recordVoiceUsage).toHaveBeenCalledWith(
      expect.objectContaining({ audioSeconds: 1, reportId: undefined })
    );
    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "voice_transcribe",
        modelId: VOICE_TRANSCRIBE_GOOGLE_MODEL_ID,
      })
    );
  });
});
