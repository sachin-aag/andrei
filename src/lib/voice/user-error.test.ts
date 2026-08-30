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
    expect(voiceUserErrorMessage("Voice session expired. Try again.")).toBe(
      "Voice session expired. Try again."
    );
  });
});
