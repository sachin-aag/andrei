// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUploadChunkTimeout } from "./upload-chunk-timeout";

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("createUploadChunkTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts with TimeoutError after the timeout while the tab is visible", () => {
    const { signal, dispose } = createUploadChunkTimeout(1_000);
    vi.advanceTimersByTime(999);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toMatchObject({ name: "TimeoutError" });
    dispose();
  });

  it("does not count time while the tab is hidden", () => {
    const { signal, dispose } = createUploadChunkTimeout(5_000);
    setVisibility("hidden");
    vi.advanceTimersByTime(30_000);
    expect(signal.aborted).toBe(false);

    setVisibility("visible");
    vi.advanceTimersByTime(4_000);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(signal.aborted).toBe(true);
    dispose();
  });

  it("starts the timer only after a hidden tab becomes visible", () => {
    setVisibility("hidden");
    const { signal, dispose } = createUploadChunkTimeout(1_000);
    vi.advanceTimersByTime(10_000);
    expect(signal.aborted).toBe(false);

    setVisibility("visible");
    vi.advanceTimersByTime(1_000);
    expect(signal.aborted).toBe(true);
    dispose();
  });
});
