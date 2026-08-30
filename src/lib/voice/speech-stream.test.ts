import { describe, expect, it } from "vitest";
import { VOICE_INPUT_MJ_CODES } from "@/lib/customers/packs";
import {
  buildVoiceStreamingConfig,
  parseSpeechResults,
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
