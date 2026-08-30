import { describe, expect, it } from "vitest";
import { encodeVoiceSse, parseVoiceSseBlock, parseVoiceSseData } from "./events";

describe("voice SSE", () => {
  it("round-trips transcript, error, and done events", () => {
    const transcript = encodeVoiceSse({
      type: "transcript",
      text: "नमस्ते",
      isFinal: false,
      languageCode: "hi-IN",
    });
    expect(parseVoiceSseData(transcript.replace(/^data: /, "").trim())).toEqual({
      type: "transcript",
      text: "नमस्ते",
      isFinal: false,
      languageCode: "hi-IN",
    });
    expect(
      parseVoiceSseData(
        encodeVoiceSse({ type: "error", message: "failed" }).replace(
          /^data: /,
          ""
        )
      )
    ).toEqual({ type: "error", message: "failed" });
    expect(parseVoiceSseData(encodeVoiceSse({ type: "done" }).replace(/^data: /, ""))).toEqual({
      type: "done",
    });
    expect(
      parseVoiceSseBlock(
        encodeVoiceSse({
          type: "transcript",
          text: "नमस्कार",
          isFinal: true,
          languageCode: "mr-IN",
        })
      )
    ).toEqual({
      type: "transcript",
      text: "नमस्कार",
      isFinal: true,
      languageCode: "mr-IN",
    });
  });

  it("rejects malformed payloads", () => {
    expect(parseVoiceSseData("")).toBeNull();
    expect(parseVoiceSseData("{not json")).toBeNull();
    expect(parseVoiceSseData(JSON.stringify({ type: "transcript" }))).toBeNull();
  });
});
