import { afterEach, describe, expect, it, vi } from "vitest";

const getPostHogServer = vi.fn();

vi.mock("@/lib/analytics/posthog-server", () => ({
  getPostHogServer: () => getPostHogServer(),
}));

import { captureChatAssistantFailure } from "./chat-failure-telemetry";

afterEach(() => {
  vi.clearAllMocks();
});

describe("captureChatAssistantFailure", () => {
  it("no-ops when PostHog is not configured", () => {
    getPostHogServer.mockReturnValue(null);
    expect(() =>
      captureChatAssistantFailure({
        error: new Error("boom"),
        userId: "user-1",
        reportId: "report-1",
        sessionId: "session-1",
        surface: "report",
        site: "stream_error",
      })
    ).not.toThrow();
  });

  it("captures a countable event and an exception for the workspace user", () => {
    const captureImmediate = vi.fn().mockResolvedValue(undefined);
    const captureExceptionImmediate = vi.fn().mockResolvedValue(undefined);
    getPostHogServer.mockReturnValue({
      captureImmediate,
      captureExceptionImmediate,
    });
    const error = new Error("gateway timeout");

    captureChatAssistantFailure({
      error,
      userId: "user-1",
      reportId: "report-1",
      sessionId: "session-1",
      surface: "analytics",
      site: "stream_start",
    });

    expect(captureImmediate).toHaveBeenCalledWith({
      distinctId: "user-1",
      event: "ai_chat_failed",
      properties: {
        surface: "analytics",
        site: "stream_start",
        reportId: "report-1",
        sessionId: "session-1",
        error: "Error: gateway timeout",
      },
    });
    expect(captureExceptionImmediate).toHaveBeenCalledWith(
      error,
      "user-1",
      expect.objectContaining({ surface: "analytics", site: "stream_start" })
    );
  });
});
