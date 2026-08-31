import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/test/ai-bypass", () => ({
  isTestStubSpeech: vi.fn(() => true),
}));

import { isTestStubSpeech } from "@/lib/test/ai-bypass";
import { VOICE_INPUT_MJ_CODES } from "@/lib/customers/packs";
import { STUB_VOICE_FINAL } from "./constants";
import {
  buildVoiceStreamingConfig,
  parseSpeechResults,
  recognizePcmWindow,
  speechRecognizerName,
} from "./speech-stream";

describe("speechRecognizerName", () => {
  it("uses the global Chirp 3 recognizer wildcard", () => {
    expect(speechRecognizerName("andrei-493614")).toBe(
      "projects/andrei-493614/locations/global/recognizers/_"
    );
  });
});

describe("buildVoiceStreamingConfig", () => {
  it("streams Chirp 3 without translating Hindi or Marathi to English", () => {
    const config = buildVoiceStreamingConfig(VOICE_INPUT_MJ_CODES);
    expect(config.config.languageCodes).toEqual(["en-IN", "hi-IN", "mr-IN"]);
    expect(config.config.model).toBe("chirp_3");
    expect(config.streamingFeatures.enableVoiceActivityEvents).toBe(false);
    expect(config.streamingFeatures.interimResults).toBe(true);
    expect(JSON.stringify(config)).not.toContain("translation");
  });
});

describe("recognizePcmWindow", () => {
  beforeEach(() => {
    vi.mocked(isTestStubSpeech).mockReturnValue(true);
  });

  it("returns the canned stub transcript without opening Chirp", async () => {
    await expect(
      recognizePcmWindow({
        pcm: new Uint8Array(4),
        languageCodes: ["en-US"],
      })
    ).resolves.toEqual({ text: STUB_VOICE_FINAL, languageCode: "en-US" });
  });

  it("skips Chirp for a short window when not stubbed", async () => {
    vi.mocked(isTestStubSpeech).mockReturnValue(false);
    await expect(
      recognizePcmWindow({
        pcm: new Uint8Array(10),
        languageCodes: ["en-US"],
      })
    ).resolves.toEqual({ text: "" });
  });
});

describe("parseSpeechResults", () => {
  it("emits native-script transcripts including Devanagari", () => {
    expect(
      parseSpeechResults([
        {
          alternatives: [{ transcript: "  नमस्कार जग  " }],
          isFinal: true,
          languageCode: "mr-IN",
        },
        {
          alternatives: [{ transcript: "" }],
          isFinal: false,
        },
      ])
    ).toEqual([
      {
        type: "transcript",
        text: "नमस्कार जग",
        isFinal: true,
        languageCode: "mr-IN",
      },
    ]);
  });
});
