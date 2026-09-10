import { describe, expect, it } from "vitest";
import { voiceUserErrorMessage } from "./user-error";

describe("voiceUserErrorMessage", () => {
  it("hides the Speech gRPC plugin metadata dump", () => {
    expect(
      voiceUserErrorMessage(
        "2 UNKNOWN: Getting metadata from plugin failed with error: headers.forEach is not a function"
      )
    ).toBe("Could not connect to voice input. Try again.");
  });

  it("keeps a short product message", () => {
    expect(voiceUserErrorMessage("Could not start voice input.")).toBe(
      "Could not start voice input."
    );
  });

  it("keeps the monthly AI budget message", () => {
    expect(
      voiceUserErrorMessage(
        "This workspace has reached its monthly AI usage limit. Contact your administrator."
      )
    ).toBe(
      "This workspace has reached its monthly AI usage limit. Contact your administrator."
    );
  });

  it("keeps the monthly voice transcription budget message", () => {
    expect(
      voiceUserErrorMessage(
        "This workspace has reached its monthly voice transcription limit. Contact your administrator."
      )
    ).toBe(
      "This workspace has reached its monthly voice transcription limit. Contact your administrator."
    );
  });

  it("maps PERMISSION_DENIED to a short unavailable toast", () => {
    expect(voiceUserErrorMessage("PERMISSION_DENIED")).toBe(
      "Voice input is unavailable right now. Try again in a moment."
    );
    expect(
      voiceUserErrorMessage(
        "PERMISSION_DENIED: Permission 'speech.recognizers.recognize' denied on resource (or it may not exist)."
      )
    ).toBe("Voice input is unavailable right now. Try again in a moment.");
  });
});
