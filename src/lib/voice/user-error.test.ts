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

  it("maps PERMISSION_DENIED to a short unavailable toast", () => {
    expect(voiceUserErrorMessage("PERMISSION_DENIED")).toBe(
      "Voice input is unavailable right now. Try again in a moment."
    );
  });
});
