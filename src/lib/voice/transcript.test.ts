import { describe, expect, it } from "vitest";
import {
  applyVoiceTranscript,
  createVoiceTranscriptState,
  joinUtterance,
  voiceComposerValue,
} from "./transcript";

describe("joinUtterance", () => {
  it("inserts a space between English tokens", () => {
    expect(joinUtterance("Check the", "assay")).toBe("Check the assay");
  });

  it("keeps a trailing space on the prefix", () => {
    expect(joinUtterance("Check the ", "assay")).toBe("Check the assay");
  });

  it("joins Devanagari without dropping native script", () => {
    expect(joinUtterance("नमस्ते", "जग")).toBe("नमस्ते जग");
    expect(joinUtterance("नमस्कार ", "जग")).toBe("नमस्कार जग");
  });
});

describe("voice transcript merge", () => {
  it("keeps typed prefix and replaces the current interim", () => {
    let state = createVoiceTranscriptState("Prefix ");
    state = applyVoiceTranscript(state, "Checking the assay", false);
    expect(voiceComposerValue(state)).toBe("Prefix Checking the assay");
    state = applyVoiceTranscript(state, "Checking the assay results", false);
    expect(voiceComposerValue(state)).toBe("Prefix Checking the assay results");
  });

  it("commits finals and leaves room for the next interim", () => {
    let state = createVoiceTranscriptState("Typed ");
    state = applyVoiceTranscript(state, "Checking the assay results", false);
    state = applyVoiceTranscript(
      state,
      "Checking the assay results from the last batch.",
      true
    );
    expect(voiceComposerValue(state)).toBe(
      "Typed Checking the assay results from the last batch."
    );
    state = applyVoiceTranscript(state, "और आगे", false);
    expect(voiceComposerValue(state)).toBe(
      "Typed Checking the assay results from the last batch. और आगे"
    );
  });

  it("keeps Hindi and Marathi Devanagari in the composer", () => {
    let state = createVoiceTranscriptState("");
    state = applyVoiceTranscript(state, "नमस्कार जग", true);
    expect(voiceComposerValue(state)).toBe("नमस्कार जग");
  });
});
