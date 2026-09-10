import { describe, expect, it } from "vitest";
import { VOICE_BYTES_PER_SECOND } from "./pcm-duration";
import {
  minutesFromSeconds,
  pcmAudioSeconds,
  secondsFromMinutes,
} from "./pcm-duration";

describe("pcmAudioSeconds", () => {
  it("returns 0 for an empty buffer", () => {
    expect(pcmAudioSeconds(new Uint8Array(0))).toBe(0);
  });

  it("ceils a short window to 1 second", () => {
    expect(pcmAudioSeconds(new Uint8Array(VOICE_BYTES_PER_SECOND * 0.2))).toBe(1);
  });

  it("counts a 30s LINEAR16 window as 30 seconds", () => {
    expect(pcmAudioSeconds(new Uint8Array(VOICE_BYTES_PER_SECOND * 30))).toBe(30);
  });
});

describe("minute conversion", () => {
  it("rounds seconds to one decimal minute", () => {
    expect(minutesFromSeconds(90)).toBe(1.5);
    expect(minutesFromSeconds(6)).toBe(0.1);
  });

  it("converts minutes to seconds", () => {
    expect(secondsFromMinutes(100_000)).toBe(6_000_000);
  });
});
