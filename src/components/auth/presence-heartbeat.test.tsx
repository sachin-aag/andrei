// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  PresenceHeartbeat,
} from "./presence-heartbeat";

describe("PresenceHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T12:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    );
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("pings once on mount and again after the interval", () => {
    render(<PresenceHeartbeat />);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toEqual(
      { seconds: 1 }
    );

    act(() => {
      vi.advanceTimersByTime(PRESENCE_HEARTBEAT_INTERVAL_MS);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body))).toEqual(
      { seconds: 30 }
    );
  });
});
