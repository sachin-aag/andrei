import { describe, expect, it } from "vitest";
import { STUB_VOICE_FINAL, STUB_VOICE_INTERIM } from "./constants";
import type { VoiceSseEvent } from "./events";
import { streamStubVoiceEvents } from "./stub-stream";

describe("streamStubVoiceEvents", () => {
  it("emits interim then final then done", async () => {
    const events: VoiceSseEvent[] = [];
    await streamStubVoiceEvents((event) => {
      events.push(event);
    }, async () => {});
    expect(events).toEqual([
      {
        type: "transcript",
        text: STUB_VOICE_INTERIM,
        isFinal: false,
        languageCode: "en-US",
      },
      {
        type: "transcript",
        text: STUB_VOICE_FINAL,
        isFinal: true,
        languageCode: "en-US",
      },
      { type: "done" },
    ]);
  });
});
