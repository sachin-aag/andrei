import { describe, expect, it } from "vitest";
import { VOICE_SAMPLE_RATE_HZ } from "./constants";
import { pcmS16leMonoToWav } from "./pcm-wav";

describe("pcmS16leMonoToWav", () => {
  it("writes a 16-bit mono PCM WAV header around the samples", () => {
    const pcm = new Uint8Array([0, 0, 1, 0, 2, 0, 3, 0]);
    const wav = Buffer.from(pcmS16leMonoToWav(pcm));
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(VOICE_SAMPLE_RATE_HZ);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.subarray(44)).toEqual(Buffer.from(pcm));
  });
});
