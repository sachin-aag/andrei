import { describe, expect, it } from "vitest";
import { VOICE_MIN_WINDOW_BYTES } from "./constants";
import { splitPcmWindows } from "./pcm-split";

describe("splitPcmWindows", () => {
  it("returns a single window when under the cap", () => {
    const pcm = new Uint8Array(100);
    expect(splitPcmWindows(pcm, 200)).toEqual([pcm]);
  });

  it("splits on the cap and merges a trailing slice under the min window", () => {
    const cap = VOICE_MIN_WINDOW_BYTES * 2;
    const pcm = new Uint8Array(cap + 10);
    const parts = splitPcmWindows(pcm, cap);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.byteLength).toBe(pcm.byteLength);
  });

  it("keeps full-size windows when the remainder is long enough", () => {
    const cap = VOICE_MIN_WINDOW_BYTES * 2;
    const pcm = new Uint8Array(cap * 2);
    const parts = splitPcmWindows(pcm, cap);
    expect(parts.map((part) => part.byteLength)).toEqual([cap, cap]);
  });
});
