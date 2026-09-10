import { describe, expect, it } from "vitest";
import {
  languageCodesForPreference,
  resolveVoiceLanguageCodes,
  VOICE_LANGUAGE_AUTO,
  voiceInputLanguageLabel,
} from "./languages";

describe("voice language preference", () => {
  it("labels MJ locales in native script", () => {
    expect(voiceInputLanguageLabel("hi-IN")).toBe("हिन्दी");
    expect(voiceInputLanguageLabel("mr-IN")).toBe("मराठी");
    expect(voiceInputLanguageLabel("en-IN")).toBe("English");
  });

  it("pins a stored locale or falls back to the pack list", () => {
    expect(languageCodesForPreference("hi-IN", ["en-IN", "hi-IN", "mr-IN"])).toEqual([
      "hi-IN",
    ]);
    expect(
      languageCodesForPreference(VOICE_LANGUAGE_AUTO, ["en-IN", "hi-IN", "mr-IN"])
    ).toEqual(["en-IN", "hi-IN", "mr-IN"]);
  });

  it("ignores language codes the pack does not enable", () => {
    expect(resolveVoiceLanguageCodes(["hi-IN", "xx-XX"], ["en-IN", "hi-IN"])).toEqual([
      "hi-IN",
    ]);
    expect(resolveVoiceLanguageCodes(["xx-XX"], ["en-US"])).toEqual(["en-US"]);
  });
});
